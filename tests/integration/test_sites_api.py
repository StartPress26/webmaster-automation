"""앱에 연결된 사이트 API의 HTTP 응답과 DB 저장을 확인합니다."""

from collections.abc import AsyncIterator
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.database import get_db
from app.main import app
from app.models.site import Site
from app.models.engine_registration import EngineRegistration

pytestmark = [pytest.mark.integration, pytest.mark.anyio]


# 실제 앱의 DB 의존성만 임시 PostgreSQL 세션으로 교체합니다.
@pytest.fixture
async def site_api(migrated_database_url: str) -> AsyncIterator[AsyncClient]:
    engine = create_async_engine(
        migrated_database_url, poolclass=NullPool, hide_parameters=True
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    # HTTP 요청마다 별도 테스트 세션을 제공합니다.
    async def test_db() -> AsyncIterator[AsyncSession]:
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = test_db

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_db)
        await engine.dispose()


# 각 테스트에서 사용할 고객사를 HTTP 요청으로 등록합니다.
@pytest.fixture
async def api_client_id(site_api: AsyncClient) -> str:
    response = await site_api.post("/clients", json={"name": "사이트 API 고객사"})
    assert response.status_code == 201
    return response.json()["id"]


# 사이트 등록 요청에 기본값과 테스트별 입력을 합칩니다.
def site_payload(customer_id: str, **changes: object) -> dict[str, object]:
    return {
        "client_id": customer_id,
        "name": "  테스트 블로그  ",
        "url": "HTTPS://EXAMPLE.COM/blog/",
        "owner_type": "client",
    } | changes


# 등록 성공 응답과 별도 DB 연결에서 확인한 저장값이 일치해야 합니다.
async def test_site_create_is_committed(
    site_api: AsyncClient, api_client_id: str, migrated_database_url: str,
) -> None:
    response = await site_api.post("/sites", json=site_payload(api_client_id))
    assert response.status_code == 201

    created = response.json()

    assert created["name"] == "테스트 블로그"
    assert created["url"] == "https://example.com/blog/"
    assert created["target_type"] == "site"
    assert created["parent_site_id"] is None
    assert created["can_edit_site"] is None
    assert created["is_active"] is True

    engine = create_async_engine(
        migrated_database_url, poolclass=NullPool, hide_parameters=True
    )

    try:
        async with AsyncSession(engine) as session:
            stored = await session.get(Site, UUID(created["id"]))
            assert stored is not None
            assert str(stored.client_id) == api_client_id
            assert stored.url == created["url"]
            assert stored.target_type == "site"
            assert stored.parent_site_id is None
    finally:
        await engine.dispose()


# HTTP 요청으로 사이트와 Naver·Bing 설정을 저장하고 응답에는 키를 포함하지 않습니다.
async def test_api_creates_indexnow_registrations(
    site_api: AsyncClient, api_client_id: str, migrated_database_url: str,
) -> None:
    response = await site_api.post("/sites", json=site_payload(
        api_client_id, indexnow_key="a1b2c3d4",
        indexnow_key_location="https://example.com/key.txt",
    ))
    assert response.status_code == 201
    assert "indexnow_key" not in response.json()

    engine = create_async_engine(migrated_database_url, poolclass=NullPool)

    try:
        async with AsyncSession(engine) as session:
            rows = (await session.scalars(select(EngineRegistration).where(
                EngineRegistration.main_site_id == UUID(response.json()["id"])
            ))).all()

            assert {row.engine for row in rows} == {"naver", "bing"}
            assert all(row.indexnow_key == "a1b2c3d4" for row in rows)
            assert all(row.registration_status == "unknown" for row in rows)
    finally:
        await engine.dispose()


# 설정이 불완전하거나 호스트·경로가 다르면 사이트도 저장하지 않습니다.
@pytest.mark.parametrize("settings", [
    {"indexnow_key": "a1b2c3d4"},
    {"indexnow_key_location": "https://example.com/key.txt"},
    {"indexnow_key": "a1b2c3d4", "indexnow_key_location": "https://other.test/key.txt"},
    {"indexnow_key": "a1b2c3d4", "indexnow_key_location": "https://example.com/other/key.txt"},
])
async def test_api_rejects_invalid_indexnow_settings(
    site_api: AsyncClient, api_client_id: str, settings: dict[str, str],
) -> None:
    response = await site_api.post("/sites", json=site_payload(api_client_id, **settings))
    assert response.status_code == 422
    listing = await site_api.get("/sites", params={"client_id": api_client_id})
    assert listing.json()["items"] == []


# 서비스 예외가 404·409로 변환되고 실패한 요청은 목록을 바꾸지 않습니다.
async def test_site_errors(site_api: AsyncClient, api_client_id: str) -> None:
    missing = await site_api.post("/sites", json=site_payload(str(uuid4())))
    assert missing.status_code == 404
    assert missing.json() == {"detail": "고객사를 찾을 수 없습니다."}
    assert (await site_api.post("/sites", json=site_payload(api_client_id))).status_code == 201
    duplicate = await site_api.post(
        "/sites", json=site_payload(api_client_id, url="https://example.com/blog/")
    )
    assert duplicate.status_code == 409
    assert duplicate.json() == {"detail": "이 고객사에 이미 등록된 URL입니다."}
    listing = await site_api.get("/sites", params={"client_id": api_client_id})
    assert len(listing.json()["items"]) == 1


# 서버 지정 필드와 잘못된 입력을 HTTP 계층에서 차단합니다.
@pytest.mark.parametrize("changes", [
    {"name": "  "}, {"url": "ftp://example.com/"}, {"owner_type": "other"},
    {"can_edit_site": "false"}, {"client_id": "invalid"},
    {"target_type": "page"}, {"parent_site_id": None}, {"is_active": False},
])
async def test_invalid_site_is_rejected(
    site_api: AsyncClient, api_client_id: str, changes: dict[str, object],
) -> None:
    response = await site_api.post("/sites", json=site_payload(api_client_id, **changes))
    assert response.status_code == 422
    listing = await site_api.get("/sites", params={"client_id": api_client_id})
    assert listing.json() == {"items": []}


# 필수 고객사 ID와 페이지 조건을 검증합니다.
@pytest.mark.parametrize("params", [
    {}, {"client_id": "invalid"},
    {"limit": 0}, {"limit": 101}, {"offset": -1},
])
async def test_invalid_query_is_rejected(
    site_api: AsyncClient, api_client_id: str, params: dict[str, str | int],
) -> None:
    query = params if "client_id" in params or not params else {"client_id": api_client_id} | params
    assert (await site_api.get("/sites", params=query)).status_code == 422


# 고객사별 목록의 글 제외·페이지 분할·빈 목록을 확인합니다.
async def test_site_listing_filters_and_paginates(
    site_api: AsyncClient, api_client_id: str, migrated_database_url: str,
) -> None:
    first = (await site_api.post("/sites", json=site_payload(api_client_id))).json()
    second = (await site_api.post(
        "/sites", json=site_payload(api_client_id, url="https://example.com/second/")
    )).json()
    other_id = (await site_api.post("/clients", json={"name": "다른 고객사"})).json()["id"]

    other_site = await site_api.post("/sites", json=site_payload(other_id))
    assert other_site.status_code == 201

    engine = create_async_engine(
        migrated_database_url, poolclass=NullPool, hide_parameters=True
    )

    try:
        async with AsyncSession(engine) as session, session.begin():
            await session.execute(insert(Site).values(
                client_id=UUID(api_client_id), parent_site_id=UUID(first["id"]),
                target_type="page", owner_type="client", name="개별 글",
                url="https://example.com/blog/post",
            ))
    finally:
        await engine.dispose()

    listing = await site_api.get("/sites", params={"client_id": api_client_id})
    assert listing.status_code == 200
    assert listing.json() == {"items": [first, second]}
    page = await site_api.get(
        "/sites", params={"client_id": api_client_id, "limit": 1, "offset": 1}
    )
    assert page.json() == {"items": [second]}
    other = await site_api.get("/sites", params={"client_id": other_id})
    assert other.json() == {"items": [other_site.json()]}
    empty = await site_api.get("/sites", params={"client_id": str(uuid4())})
    assert empty.json() == {"items": []}


# 앱의 OpenAPI에 사이트 등록과 목록 조회가 노출되는지 확인합니다.
async def test_site_routes_are_documented(site_api: AsyncClient) -> None:
    response = await site_api.get("/openapi.json")
    assert response.status_code == 200

    operations = response.json()["paths"]["/sites"]

    assert "201" in operations["post"]["responses"]
    assert {"get", "post"} <= operations.keys()
    assert (await site_api.get("/docs")).status_code == 200


# 설정 추가·반복 저장·교체 후에도 두 엔진의 등록 상태와 키 비공개를 보장합니다.
async def test_indexnow_settings_roundtrip(
    site_api: AsyncClient, api_client_id: str, migrated_database_url: str,
) -> None:
    created = (await site_api.post("/sites", json=site_payload(api_client_id))).json()
    path = f"/sites/{created['id']}/indexnow-settings"

    assert (await site_api.get(path)).json() == {"configured": False, "key_location": None}

    payload = {"key": "a1b2c3d4", "key_location": "https://example.com/key.txt"}
    expected = {"configured": True, "key_location": payload["key_location"]}

    for _ in range(2):
        response = await site_api.put(path, json=payload)
        assert response.status_code == 200
        assert response.json() == expected
        assert payload["key"] not in response.text

    engine = create_async_engine(migrated_database_url, poolclass=NullPool, hide_parameters=True)

    try:
        async with AsyncSession(engine) as session, session.begin():
            rows = tuple(await session.scalars(select(EngineRegistration).where(
                EngineRegistration.main_site_id == UUID(created["id"])
            )))

            assert len(rows) == 2
            await session.execute(update(EngineRegistration).where(
                EngineRegistration.main_site_id == UUID(created["id"])
            ).values(registration_status="verified", error_message="기존 기록"))

        replacement = {"key": "deadbeef", "key_location": "https://example.com/new-key.txt"}

        assert (await site_api.put(path, json=replacement)).status_code == 200

        async with AsyncSession(engine) as session:
            rows = tuple(await session.scalars(select(EngineRegistration).where(
                EngineRegistration.main_site_id == UUID(created["id"])
            )))

            assert len(rows) == 2
            assert all(row.indexnow_key == replacement["key"] for row in rows)
            assert all(row.indexnow_key_location == replacement["key_location"] for row in rows)
            assert all(row.registration_status == "verified" for row in rows)
            assert all(row.error_message == "기존 기록" for row in rows)

        assert (await site_api.get(path)).json() == {
            "configured": True, "key_location": replacement["key_location"],
        }
    finally:
        await engine.dispose()


# 잘못된 설정은 저장하지 않고 검증 응답에도 키를 노출하지 않습니다.
@pytest.mark.parametrize("payload", [
    {"key": "secret-invalid-key", "key_location": "https://example.com/key.txt"},
    {"key": "a1b2c3d4"},
    {"key": "a1b2c3d4", "key_location": "https://other.test/key.txt"},
    {"key": "a1b2c3d4", "key_location": "https://example.com/other/key.txt"},
    {"key": "a1b2c3d4", "key_location": "https://example.com/key.txt", "extra": "a1b2c3d4"},
])
async def test_indexnow_settings_invalid(
    site_api: AsyncClient, api_client_id: str, payload: dict[str, str],
) -> None:
    created = (await site_api.post("/sites", json=site_payload(api_client_id))).json()
    path = f"/sites/{created['id']}/indexnow-settings"

    response = await site_api.put(path, json=payload)
    assert response.status_code == 422
    assert payload["key"] not in response.text
    assert (await site_api.get(path)).json() == {"configured": False, "key_location": None}


# 미존재 사이트와 개별 글은 설정 조회·변경 대상으로 허용하지 않습니다.
async def test_indexnow_settings_main_site_only(
    site_api: AsyncClient, api_client_id: str, migrated_database_url: str,
) -> None:
    created = (await site_api.post("/sites", json=site_payload(api_client_id))).json()
    page_id = uuid4()
    engine = create_async_engine(migrated_database_url, poolclass=NullPool, hide_parameters=True)

    try:
        async with AsyncSession(engine) as session, session.begin():
            await session.execute(insert(Site).values(
                id=page_id, client_id=UUID(api_client_id), parent_site_id=UUID(created["id"]),
                target_type="page", owner_type="client", name="글", url="https://example.com/blog/post",
            ))

        for site_id in (uuid4(), page_id):
            path = f"/sites/{site_id}/indexnow-settings"

            assert (await site_api.get(path)).status_code == 404
            response = await site_api.put(path, json={
                "key": "a1b2c3d4", "key_location": "https://example.com/key.txt",
            })
            assert response.status_code == 404
    finally:
        await engine.dispose()


# 기존 불일치를 조회 오류로 알리고 PUT으로 누락 행까지 복구합니다.
async def test_indexnow_settings_conflict_and_repair(
    site_api: AsyncClient, api_client_id: str, migrated_database_url: str,
) -> None:
    created = (await site_api.post("/sites", json=site_payload(api_client_id))).json()
    path = f"/sites/{created['id']}/indexnow-settings"
    engine = create_async_engine(migrated_database_url, poolclass=NullPool, hide_parameters=True)

    try:
        async with AsyncSession(engine) as session, session.begin():
            await session.execute(insert(EngineRegistration).values(
                main_site_id=UUID(created["id"]), engine="bing", registration_status="verified",
                indexnow_key="deadbeef", indexnow_key_location="https://example.com/old.txt",
            ))

        assert (await site_api.get(path)).status_code == 409
        assert (await site_api.put(path, json={
            "key": "a1b2c3d4", "key_location": "https://example.com/key.txt",
        })).status_code == 200
        assert (await site_api.get(path)).json()["configured"] is True
    finally:
        await engine.dispose()


# 한 요청으로 글을 커밋한 뒤 부모 설정으로 한 번 알리고 알림 실패에도 글을 유지합니다.
@pytest.mark.parametrize("upstream, expected", [
    (200, "accepted"), (202, "key_pending"), (400, "failed"),
    (429, "failed"), (500, "failed"), ("timeout", "unknown"), ("network", "unknown"),
])
async def test_page_save_and_notify(
    site_api: AsyncClient, api_client_id: str, migrated_database_url: str,
    upstream: int | str, expected: str,
) -> None:
    import json
    from unittest.mock import AsyncMock

    import httpx

    from app.api.pages import get_indexnow_client
    from app.engines.indexnow.client import IndexNowClient

    parent = (await site_api.post("/sites", json=site_payload(
        api_client_id, indexnow_key="a1b2c3d4", indexnow_key_location="https://example.com/key.txt",
    ))).json()
    engine = create_async_engine(migrated_database_url, poolclass=NullPool, hide_parameters=True)
    url = "https://example.com/blog/hello?lang=ko"

    # 외부 요청 시점에 이미 글이 독립 DB 연결에서 보여야 합니다.
    async def observe(request: httpx.Request) -> httpx.Response:
        async with AsyncSession(engine) as session:
            row = await session.scalar(select(Site).where(
                Site.client_id == UUID(api_client_id), Site.url == url,
            ))
            assert row is not None
            assert row.target_type == "page"
            assert row.parent_site_id == UUID(parent["id"])
            assert row.owner_type == parent["owner_type"]
            assert row.cms_type is None and row.can_edit_site is None

        assert json.loads(request.content) == {
            "host": "example.com", "key": "a1b2c3d4", "urlList": [url],
            "keyLocation": "https://example.com/key.txt",
        }

        if upstream == "timeout":
            raise httpx.ReadTimeout("비공개 원본 오류", request=request)
        if upstream == "network":
            raise httpx.ConnectError("비공개 원본 오류", request=request)

        return httpx.Response(upstream)

    handler = AsyncMock(side_effect=observe)

    try:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
            # HTTP 전송만 모의 처리하고 실제 IndexNow 클라이언트를 사용합니다.
            async def indexnow() -> IndexNowClient:
                return IndexNowClient(http_client)

            app.dependency_overrides[get_indexnow_client] = indexnow
            path = f"/sites/{parent['id']}/pages"

            response = await site_api.post(path, json={"name": " 새 글 ", "url": url})
            assert response.status_code == 201

            body = response.json()

            assert body["page"]["name"] == "새 글"
            assert body["page"]["client_id"] == api_client_id
            assert body["submission"]["status"] == expected
            assert body["submission"]["upstream_http_status"] == (upstream if isinstance(upstream, int) else None)
            assert "a1b2c3d4" not in response.text
            assert "비공개 원본 오류" not in response.text
            handler.assert_awaited_once()
            duplicate = await site_api.post(path, json={"name": "중복", "url": url})
            assert duplicate.status_code == 409
            handler.assert_awaited_once()

        async with AsyncSession(engine) as session:
            assert await session.get(Site, UUID(body["page"]["id"])) is not None
    finally:
        app.dependency_overrides.pop(get_indexnow_client, None)
        await engine.dispose()


# 알림 비활성·키 미설정·키 불일치도 글 저장 결과와 분리해 반환합니다.
@pytest.mark.parametrize("scenario, expected, code", [
    ("disabled", "skipped", "NOTIFICATION_DISABLED"),
    ("missing", "skipped", "INDEXNOW_NOT_CONFIGURED"),
    ("inconsistent", "failed", "INDEXNOW_SETTINGS_INCONSISTENT"),
])
async def test_page_notification_preconditions(
    site_api: AsyncClient, api_client_id: str, migrated_database_url: str,
    scenario: str, expected: str, code: str,
) -> None:
    from unittest.mock import Mock
    import httpx
    from app.api.pages import get_indexnow_client
    from app.engines.indexnow.client import IndexNowClient

    parent = (await site_api.post("/sites", json=site_payload(api_client_id))).json()
    engine = create_async_engine(migrated_database_url, poolclass=NullPool, hide_parameters=True)
    handler = Mock(side_effect=AssertionError("알림을 전송하면 안 됩니다."))

    try:
        if scenario == "inconsistent":
            async with AsyncSession(engine) as session, session.begin():
                await session.execute(insert(EngineRegistration).values(
                    main_site_id=UUID(parent["id"]), engine="bing",
                    indexnow_key="a1b2c3d4", indexnow_key_location="https://example.com/key.txt",
                ))

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
            # 선행 조건으로 알림이 생략될 때 외부 전송을 금지합니다.
            async def indexnow() -> IndexNowClient:
                return IndexNowClient(http_client)

            app.dependency_overrides[get_indexnow_client] = indexnow

            response = await site_api.post(f"/sites/{parent['id']}/pages", json={
                "name": "글", "url": "https://example.com/blog/hello",
                "notify_search_engines": scenario != "disabled",
            })

        assert response.status_code == 201
        assert response.json()["submission"]["status"] == expected
        assert response.json()["submission"]["error_code"] == code
        handler.assert_not_called()

        async with AsyncSession(engine) as session:
            assert await session.get(Site, UUID(response.json()["page"]["id"])) is not None
    finally:
        app.dependency_overrides.pop(get_indexnow_client, None)
        await engine.dispose()


# 다른 출처·경로와 메인페이지 자체는 글로 저장하지 않습니다.
@pytest.mark.parametrize("url", [
    "https://other.test/blog/post", "http://example.com/blog/post",
    "https://example.com:444/blog/post", "https://example.com/blog-other/post",
    "https://example.com/other", "https://example.com/blog/",
])
async def test_page_rejects_outside_parent(
    site_api: AsyncClient, api_client_id: str, url: str,
) -> None:
    parent = (await site_api.post("/sites", json=site_payload(api_client_id))).json()

    response = await site_api.post(f"/sites/{parent['id']}/pages", json={
        "name": "잘못된 글", "url": url,
    })
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "INVALID_PAGE_SCOPE"


# 부모 없음·글을 부모로 지정·비활성 부모를 명확히 거절합니다.
async def test_page_parent_validation(
    site_api: AsyncClient, api_client_id: str, migrated_database_url: str,
) -> None:
    payload = {"name": "글", "url": "https://example.com/blog/hello", "notify_search_engines": False}

    assert (await site_api.post(f"/sites/{uuid4()}/pages", json=payload)).status_code == 404

    parent = (await site_api.post("/sites", json=site_payload(api_client_id))).json()
    page = (await site_api.post(f"/sites/{parent['id']}/pages", json=payload)).json()["page"]

    assert (await site_api.post(f"/sites/{page['id']}/pages", json=payload)).status_code == 404

    engine = create_async_engine(migrated_database_url, poolclass=NullPool, hide_parameters=True)

    try:
        async with AsyncSession(engine) as session, session.begin():
            await session.execute(update(Site).where(Site.id == UUID(parent["id"])).values(is_active=False))
        assert (await site_api.post(f"/sites/{parent['id']}/pages", json=payload)).status_code == 409
    finally:
        await engine.dispose()


# 동시 중복 요청에서도 글은 하나만 생성하고 알림은 한 번만 전송합니다.
async def test_concurrent_page_creation_notifies_once(
    site_api: AsyncClient, api_client_id: str,
) -> None:
    import asyncio
    from unittest.mock import Mock
    import httpx
    from app.api.pages import get_indexnow_client
    from app.engines.indexnow.client import IndexNowClient

    parent = (await site_api.post("/sites", json=site_payload(
        api_client_id, indexnow_key="a1b2c3d4", indexnow_key_location="https://example.com/key.txt",
    ))).json()
    handler = Mock(return_value=httpx.Response(200))

    try:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
            # 동시 요청에 같은 모의 전송 클라이언트를 제공합니다.
            async def indexnow() -> IndexNowClient:
                return IndexNowClient(http_client)

            app.dependency_overrides[get_indexnow_client] = indexnow
            path = f"/sites/{parent['id']}/pages"

            responses = await asyncio.gather(*(
                site_api.post(path, json={"name": "글", "url": "https://example.com/blog/concurrent"})
                for _ in range(2)
            ))

        assert sorted(response.status_code for response in responses) == [201, 409]
        handler.assert_called_once()
    finally:
        app.dependency_overrides.pop(get_indexnow_client, None)


# DB 저장 도중 실패하면 글을 롤백하고 외부 알림을 보내지 않습니다.
async def test_page_storage_failure_does_not_notify(
    site_api: AsyncClient, api_client_id: str, migrated_database_url: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from unittest.mock import Mock
    import httpx
    from sqlalchemy.exc import SQLAlchemyError
    from sqlalchemy.sql.dml import Insert
    from app.api.pages import get_indexnow_client
    from app.engines.indexnow.client import IndexNowClient

    parent = (await site_api.post("/sites", json=site_payload(
        api_client_id, indexnow_key="a1b2c3d4", indexnow_key_location="https://example.com/key.txt",
    ))).json()
    original = AsyncSession.scalar
    handler = Mock(side_effect=AssertionError("DB 실패 후 전송하면 안 됩니다."))

    # 실제 INSERT 뒤 오류를 발생시켜 저장 전체의 롤백을 확인합니다.
    async def fail_insert(self: AsyncSession, statement: object, *args: object, **kwargs: object) -> object:
        result = await original(self, statement, *args, **kwargs)
        if isinstance(statement, Insert) and statement.table.name == "sites":
            raise SQLAlchemyError("글 저장 테스트 오류")
        return result

    monkeypatch.setattr(AsyncSession, "scalar", fail_insert)

    url = "https://example.com/blog/rollback"

    try:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
            # 저장 실패 시에는 모의 클라이언트도 호출되지 않아야 합니다.
            async def indexnow() -> IndexNowClient:
                return IndexNowClient(http_client)

            app.dependency_overrides[get_indexnow_client] = indexnow

            with pytest.raises(SQLAlchemyError, match="글 저장 테스트 오류"):
                await site_api.post(f"/sites/{parent['id']}/pages", json={"name": "글", "url": url})

        handler.assert_not_called()

        engine = create_async_engine(migrated_database_url, poolclass=NullPool, hide_parameters=True)

        try:
            async with AsyncSession(engine) as session:
                assert await session.scalar(select(Site).where(
                    Site.client_id == UUID(api_client_id), Site.url == url,
                )) is None
        finally:
            await engine.dispose()
    finally:
        app.dependency_overrides.pop(get_indexnow_client, None)


# 부모·고객사별로 글을 분리하고 생성 시각이 같아도 ID 순으로 안정적으로 페이지 조회합니다.
async def test_page_listing_filters_and_paginates(
    site_api: AsyncClient, api_client_id: str, migrated_database_url: str,
) -> None:
    from datetime import datetime, timezone
    from app.api.pages import get_indexnow_client

    parent = (await site_api.post("/sites", json=site_payload(api_client_id))).json()
    other_parent = (await site_api.post("/sites", json=site_payload(
        api_client_id, url="https://example.com/other/",
    ))).json()
    other_customer = (await site_api.post("/clients", json={"name": "다른 고객사"})).json()["id"]
    foreign_parent = (await site_api.post("/sites", json=site_payload(other_customer))).json()
    page_ids = tuple([(await site_api.post(f"/sites/{parent['id']}/pages", json={
        "name": f"글 {index}", "url": f"https://example.com/blog/post-{index}",
        "notify_search_engines": False,
    })).json()["page"]["id"] for index in range(3)])

    for main_id, url in (
        (other_parent["id"], "https://example.com/other/post"),
        (foreign_parent["id"], "https://example.com/blog/foreign"),
    ):
        assert (await site_api.post(f"/sites/{main_id}/pages", json={
            "name": "다른 부모의 글", "url": url, "notify_search_engines": False,
        })).status_code == 201

    engine = create_async_engine(migrated_database_url, poolclass=NullPool, hide_parameters=True)

    try:
        async with AsyncSession(engine) as session, session.begin():
            await session.execute(update(Site).where(Site.id.in_(tuple(UUID(value) for value in page_ids))).values(
                created_at=datetime(2026, 11, 3, tzinfo=timezone.utc),
            ))
            await session.execute(update(Site).where(Site.id.in_((UUID(parent["id"]), UUID(page_ids[0])))).values(is_active=False))

        # GET은 IndexNow 클라이언트를 생성하지 않습니다.
        def forbidden_client() -> None:
            pytest.fail("글 목록 조회는 외부 클라이언트를 준비하지 않습니다.")

        app.dependency_overrides[get_indexnow_client] = forbidden_client
        path = f"/sites/{parent['id']}/pages"

        response = await site_api.get(path)
        assert response.status_code == 200

        rows = response.json()["items"]

        assert [row["id"] for row in rows] == sorted(page_ids)
        assert all(row["client_id"] == api_client_id and row["parent_site_id"] == parent["id"] for row in rows)
        assert all(row["target_type"] == "page" for row in rows)
        assert next(row for row in rows if row["id"] == page_ids[0])["is_active"] is False
        assert (await site_api.get(path, params={"limit": 1, "offset": 1})).json() == {"items": rows[1:2]}
        assert (await site_api.get(path, params={"offset": 3})).json() == {"items": []}

        schema = (await site_api.get("/openapi.json")).json()

        assert {"get", "post"} <= schema["paths"]["/sites/{main_site_id}/pages"].keys()
    finally:
        app.dependency_overrides.pop(get_indexnow_client, None)
        await engine.dispose()


# 빈 목록은 200, 없는 부모나 글을 부모로 지정한 경우는 404입니다.
async def test_page_listing_parent_validation(site_api: AsyncClient, api_client_id: str) -> None:
    parent = (await site_api.post("/sites", json=site_payload(api_client_id))).json()
    path = f"/sites/{parent['id']}/pages"

    assert (await site_api.get(path)).json() == {"items": []}

    page = (await site_api.post(path, json={
        "name": "글", "url": "https://example.com/blog/post", "notify_search_engines": False,
    })).json()["page"]

    for parent_id in (uuid4(), page["id"]):
        response = await site_api.get(f"/sites/{parent_id}/pages")
        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "MAIN_SITE_NOT_FOUND"

    assert (await site_api.get("/sites/not-a-uuid/pages")).status_code == 422


# 목록의 페이지 크기와 오프셋 경계를 검증합니다.
@pytest.mark.parametrize("params", [{"limit": 0}, {"limit": 101}, {"offset": -1}, {"limit": "invalid"}])
async def test_page_listing_invalid_query(
    site_api: AsyncClient, api_client_id: str, params: dict[str, int | str],
) -> None:
    parent = (await site_api.post("/sites", json=site_payload(api_client_id))).json()
    assert (await site_api.get(f"/sites/{parent['id']}/pages", params=params)).status_code == 422
