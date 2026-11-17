"""임시 PostgreSQL에서 기존 글 재알림의 소속 검증과 데이터 보존을 확인합니다."""

from collections.abc import AsyncIterator
from unittest.mock import Mock
from uuid import UUID

import httpx
import pytest
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.api.pages import get_indexnow_client
from app.core.database import get_db
from app.engines.indexnow.client import IndexNowClient
from app.main import app
from app.models.site import Site

pytestmark = [pytest.mark.integration, pytest.mark.anyio]


# 이 실행에서 생성한 임시 DB와 가짜 IndexNow 전송만 HTTP 앱에 연결합니다.
@pytest.fixture
async def notification_api(
    migrated_database_url: str,
) -> AsyncIterator[tuple[httpx.AsyncClient, async_sessionmaker[AsyncSession], Mock]]:
    engine = create_async_engine(migrated_database_url, poolclass=NullPool, hide_parameters=True)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    handler = Mock(return_value=httpx.Response(200))

    # 요청마다 독립된 임시 DB 세션을 생성합니다.
    async def database() -> AsyncIterator[AsyncSession]:
        async with sessions() as session:
            yield session

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as transport:
        # 공통 알림은 실제 네트워크 대신 한 번의 가짜 HTTP 전송으로 검증합니다.
        def indexnow() -> IndexNowClient:
            return IndexNowClient(transport)

        app.dependency_overrides[get_db] = database
        app.dependency_overrides[get_indexnow_client] = indexnow
        try:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                yield client, sessions, handler
        finally:
            app.dependency_overrides.pop(get_db, None)
            app.dependency_overrides.pop(get_indexnow_client, None)
    await engine.dispose()


# 저장만 수행한 기존 글과 선택적인 부모 IndexNow 설정을 준비합니다.
async def existing_page(client: httpx.AsyncClient, configured: bool = True) -> tuple[dict, dict]:
    customer = (await client.post("/clients", json={"name": "재알림 테스트 고객사"})).json()
    parent = (await client.post("/sites", json={
        "client_id": customer["id"], "name": "기존 블로그",
        "url": "https://example.com/blog/", "owner_type": "client",
    })).json()
    if configured:
        response = await client.put(f"/sites/{parent['id']}/indexnow-settings", json={
            "key": "a1b2c3d4", "key_location": "https://example.com/key.txt",
        })
        assert response.status_code == 200
    response = await client.post(f"/sites/{parent['id']}/pages", json={
        "name": "수정하면 안 되는 기존 제목", "url": "https://example.com/blog/post",
        "notify_search_engines": False,
    })
    assert response.status_code == 201
    return parent, response.json()["page"]


# 중복 저장 거절 후 명시적 재알림만 전송하고 글 ID·제목·생성일과 행 수를 보존합니다.
async def test_duplicate_then_explicit_notification_preserves_page(notification_api: tuple) -> None:
    client, sessions, handler = notification_api
    parent, page = await existing_page(client)
    handler.assert_not_called()
    async with sessions() as session:
        count_before = await session.scalar(select(func.count()).select_from(Site))
    duplicate = await client.post(f"/sites/{parent['id']}/pages", json={
        "name": "새 입력 제목", "url": page["url"], "notify_search_engines": True,
    })
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"]["code"] == "DUPLICATE_PAGE"
    handler.assert_not_called()
    response = await client.post(f"/sites/{parent['id']}/pages/{page['id']}/notifications",
                                 json={"expected_url": page["url"]})
    assert response.status_code == 200
    assert response.json()["page"] == page
    assert response.json()["submission"]["status"] == "accepted"
    handler.assert_called_once()
    async with sessions() as session:
        assert await session.scalar(select(func.count()).select_from(Site)) == count_before
        stored = await session.get(Site, UUID(page["id"]))
        assert stored.name == page["name"]
        assert stored.url == page["url"]


# 다른 고객사의 메인 사이트에 기존 글 ID를 넣어도 알림을 전송하지 않습니다.
async def test_notification_rejects_different_customer_parent(notification_api: tuple) -> None:
    client, _, handler = notification_api
    _, page = await existing_page(client)
    other_parent, _ = await existing_page(client)
    response = await client.post(f"/sites/{other_parent['id']}/pages/{page['id']}/notifications",
                                 json={"expected_url": page["url"]})
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "PAGE_NOT_FOUND"
    handler.assert_not_called()


# 비활성 상태는 재알림 대상에서 제외하고 명확한 오류를 반환합니다.
@pytest.mark.parametrize("target", ["parent", "page"])
async def test_notification_rejects_inactive(notification_api: tuple, target: str) -> None:
    client, sessions, handler = notification_api
    parent, page = await existing_page(client)
    async with sessions() as session, session.begin():
        await session.execute(update(Site).where(Site.id == UUID(parent["id"] if target == "parent" else page["id"]))
                              .values(is_active=False))
    response = await client.post(f"/sites/{parent['id']}/pages/{page['id']}/notifications",
                                 json={"expected_url": page["url"]})
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "SITE_INACTIVE"
    handler.assert_not_called()


# 부모 설정이 없는 기존 글도 저장은 유지하고 외부 전송을 생략합니다.
async def test_notification_without_settings_preserves_page(notification_api: tuple) -> None:
    client, _, handler = notification_api
    parent, page = await existing_page(client, configured=False)
    response = await client.post(f"/sites/{parent['id']}/pages/{page['id']}/notifications",
                                 json={"expected_url": page["url"]})
    assert response.status_code == 200
    assert response.json()["page"] == page
    assert response.json()["submission"]["error_code"] == "INDEXNOW_NOT_CONFIGURED"
    handler.assert_not_called()


# DB 관계는 맞더라도 저장 URL이 부모 범위 밖이면 전송을 거부합니다.
async def test_notification_rejects_corrupt_url_scope(notification_api: tuple) -> None:
    client, sessions, handler = notification_api
    parent, page = await existing_page(client)
    async with sessions() as session, session.begin():
        await session.execute(update(Site).where(Site.id == UUID(page["id"]))
                              .values(url="https://other.example/post"))
    response = await client.post(f"/sites/{parent['id']}/pages/{page['id']}/notifications",
                                 json={"expected_url": "https://other.example/post"})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "INVALID_PAGE_SCOPE"
    handler.assert_not_called()


# 승인한 URL이 DB에서 변경됐으면 다른 URL의 알림을 실행하지 않습니다.
async def test_notification_rejects_changed_confirmed_url(notification_api: tuple) -> None:
    client, sessions, handler = notification_api
    parent, page = await existing_page(client)
    async with sessions() as session, session.begin():
        await session.execute(update(Site).where(Site.id == UUID(page["id"]))
                              .values(url="https://example.com/blog/changed"))
    response = await client.post(f"/sites/{parent['id']}/pages/{page['id']}/notifications",
                                 json={"expected_url": page["url"]})
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "PAGE_URL_CHANGED"
    handler.assert_not_called()
