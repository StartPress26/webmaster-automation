"""임시 DB와 모의 제출 함수로 사이트맵 API의 경계를 검증합니다."""

from collections.abc import AsyncIterator
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.api.sitemaps import get_submitter
from app.core.database import get_db
from app.engines.bing import BingEngineError
from app.engines.google.google import GoogleEngineError
from app.engines.sitemap import SitemapSubmitter
from app.main import app
from app.models.engine_registration import EngineRegistration
from app.models.site import Site
from app.models.site_engine_status import SiteEngineStatus

pytestmark = [pytest.mark.integration, pytest.mark.anyio]


# 요청별 임시 DB 세션을 주입하고 외부 제출은 모의 함수로 대체합니다.
@pytest.fixture
async def sitemap_api(migrated_database_url: str) -> AsyncIterator[tuple[AsyncClient, AsyncMock]]:
    engine = create_async_engine(migrated_database_url, poolclass=NullPool, hide_parameters=True)
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    # 엔진의 정상 접수 응답만 모의합니다.
    async def accepted(*args: object) -> bool:
        return True

    submitter = AsyncMock(side_effect=accepted)

    # 요청 세션은 응답이 끝나면 닫습니다.
    async def database() -> AsyncIterator[AsyncSession]:
        async with sessions() as session:
            yield session

    # 실제 인증 로드와 외부 호출을 막습니다.
    def dependency() -> SitemapSubmitter:
        return submitter

    app.dependency_overrides[get_db] = database
    app.dependency_overrides[get_submitter] = dependency
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as api:
            yield api, submitter
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_submitter, None)
        await engine.dispose()


# 기존 API로 서로 독립적인 고객사와 메인 사이트를 만듭니다.
async def create_site(api: AsyncClient, root: str = "https://example.com/") -> str:
    client = (await api.post("/clients", json={"name": "사이트맵 테스트"})).json()
    response = await api.post("/sites", json={
        "client_id": client["id"], "name": "블로그", "url": root, "owner_type": "client",
    })
    assert response.status_code == 201
    return response.json()["id"]


# 두 엔진 모두 정확한 주소를 제출하고 기존 등록·색인 상태를 생성하지 않습니다.
@pytest.mark.parametrize("engine_name", ["google", "bing"])
async def test_submit_success(
    sitemap_api: tuple[AsyncClient, AsyncMock], migrated_database_url: str, engine_name: str,
) -> None:
    api, submitter = sitemap_api
    site_id = await create_site(api)
    response = await api.post(f"/sites/{site_id}/sitemaps", json={
        "engine": engine_name, "sitemap_url": "https://example.com/sitemap.xml",
    })
    assert response.status_code == 200
    assert response.json() == {
        "main_site_id": site_id, "engine": engine_name,
        "sitemap_url": "https://example.com/sitemap.xml", "status": "accepted",
    }
    submitter.assert_awaited_once_with(engine_name, "https://example.com/", "https://example.com/sitemap.xml")
    db = create_async_engine(migrated_database_url, poolclass=NullPool)
    try:
        async with AsyncSession(db) as session:
            assert await session.scalar(select(EngineRegistration).where(
                EngineRegistration.main_site_id == UUID(site_id),
            )) is None
            assert await session.scalar(select(SiteEngineStatus).where(
                SiteEngineStatus.site_id == UUID(site_id),
            )) is None
    finally:
        await db.dispose()


# 없는 ID와 개별 글은 메인 사이트 제출 대상으로 허용하지 않습니다.
async def test_reject_missing_and_page(sitemap_api: tuple[AsyncClient, AsyncMock]) -> None:
    api, submitter = sitemap_api
    site_id = await create_site(api)
    page = (await api.post(f"/sites/{site_id}/pages", json={
        "name": "글", "url": "https://example.com/post", "notify_search_engines": False,
    })).json()["page"]
    for target in (str(uuid4()), page["id"]):
        response = await api.post(f"/sites/{target}/sitemaps", json={
            "engine": "google", "sitemap_url": "https://example.com/sitemap.xml",
        })
        assert response.status_code == 404
    submitter.assert_not_awaited()


# 비활성 사이트는 외부에 제출하지 않습니다.
async def test_reject_inactive(
    sitemap_api: tuple[AsyncClient, AsyncMock], migrated_database_url: str,
) -> None:
    api, submitter = sitemap_api
    site_id = await create_site(api)
    db = create_async_engine(migrated_database_url, poolclass=NullPool)
    try:
        async with AsyncSession(db) as session, session.begin():
            await session.execute(update(Site).where(Site.id == UUID(site_id)).values(is_active=False))
    finally:
        await db.dispose()
    response = await api.post(f"/sites/{site_id}/sitemaps", json={
        "engine": "bing", "sitemap_url": "https://example.com/sitemap.xml",
    })
    assert response.status_code == 409
    submitter.assert_not_awaited()


# 잘못된 엔진·주소·추가 필드와 다른 출처를 외부 호출 전에 거부합니다.
@pytest.mark.parametrize("body", [
    {}, {"engine": "naver", "sitemap_url": "https://example.com/sitemap.xml"},
    {"engine": "google", "sitemap_url": "https://other.com/sitemap.xml"},
    {"engine": "google", "sitemap_url": "http://example.com/sitemap.xml"},
    {"engine": "google", "sitemap_url": "https://example.com:444/sitemap.xml"},
    {"engine": "google", "sitemap_url": "https://user:pass@example.com/sitemap.xml"},
    {"engine": "google", "sitemap_url": "https://example.com/sitemap.xml#x"},
    {"engine": "google", "sitemap_url": "https://example.com/%252e%252e/sitemap.xml"},
    {"engine": "google", "sitemap_url": "https://example.com/sitemap.xml", "extra": True},
])
async def test_reject_input(sitemap_api: tuple[AsyncClient, AsyncMock], body: dict[str, object]) -> None:
    api, submitter = sitemap_api
    site_id = await create_site(api)
    assert (await api.post(f"/sites/{site_id}/sitemaps", json=body)).status_code == 422
    submitter.assert_not_awaited()


# Google 하위 속성의 경계와 Bing의 루트 사이트 제한을 검사합니다.
@pytest.mark.parametrize("engine_name,url,expected", [
    ("google", "https://example.com/blog/sitemap.xml", 200),
    ("google", "https://example.com/blogger/sitemap.xml", 422),
    ("google", "https://example.com/sitemap.xml", 422),
    ("bing", "https://example.com/blog/sitemap.xml", 422),
])
async def test_path_scope(
    sitemap_api: tuple[AsyncClient, AsyncMock], engine_name: str, url: str, expected: int,
) -> None:
    api, submitter = sitemap_api
    site_id = await create_site(api, "https://example.com/blog/")
    assert (await api.post(f"/sites/{site_id}/sitemaps", json={
        "engine": engine_name, "sitemap_url": url,
    })).status_code == expected
    assert submitter.await_count == (1 if expected == 200 else 0)


# 엔진 원문에 비밀값이 있어도 응답은 고정 오류만 내보내고 재시도하지 않습니다.
@pytest.mark.parametrize("error_type", [GoogleEngineError, BingEngineError])
@pytest.mark.parametrize("code,status", [
    ("authentication", 503), ("permission", 502), ("rate_limit", 429),
    ("timeout", 504), ("connection", 502), ("response", 502),
])
async def test_upstream_errors(
    sitemap_api: tuple[AsyncClient, AsyncMock],
    error_type: type[GoogleEngineError] | type[BingEngineError], code: str, status: int,
) -> None:
    api, submitter = sitemap_api
    site_id = await create_site(api)
    submitter.side_effect = error_type(code, "secret-token")
    response = await api.post(f"/sites/{site_id}/sitemaps", json={
        "engine": "google" if error_type is GoogleEngineError else "bing",
        "sitemap_url": "https://example.com/sitemap.xml",
    })
    assert response.status_code == status
    assert response.json()["detail"]["code"] == f"ENGINE_{code.upper()}"
    assert "secret-token" not in response.text
    submitter.assert_awaited_once()
