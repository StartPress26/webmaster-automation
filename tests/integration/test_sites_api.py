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
