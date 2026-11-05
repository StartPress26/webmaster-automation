"""임시 DB와 모의 엔진으로 검사 실행·저장·읽기 전용 GET을 검증합니다."""

from collections.abc import AsyncIterator
from datetime import datetime, timezone
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.api.inspections import get_inspector
from app.core.database import get_db
from app.engines.bing import BingEngineError, BingUrlInspection
from app.engines.google.google import GoogleEngineError, GoogleUrlInspection
from app.engines.inspection import Inspector
from app.main import app
from app.models.site import Site
from app.models.site_engine_status import SiteEngineStatus

pytestmark = [pytest.mark.integration, pytest.mark.anyio]


# 테스트 요청을 임시 DB에 연결하고 실제 엔진 호출을 금지합니다.
@pytest.fixture
async def inspection_api(migrated_database_url: str) -> AsyncIterator[AsyncClient]:
    engine = create_async_engine(migrated_database_url, poolclass=NullPool, hide_parameters=True)
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    # 매 HTTP 요청에 독립된 임시 세션을 제공합니다.
    async def database() -> AsyncIterator[AsyncSession]:
        async with sessions() as session:
            yield session

    # 명시적인 모의 엔진 없이는 어떤 외부 호출도 허용하지 않습니다.
    async def forbidden(*args: object) -> None:
        pytest.fail("실제 검색엔진 호출 금지")

    # GET이 이 의존성까지 호출하지 않는지 확인할 수 있도록 분리합니다.
    def inspector() -> Inspector:
        return forbidden

    app.dependency_overrides[get_db] = database
    app.dependency_overrides[get_inspector] = inspector
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_inspector, None)
        await engine.dispose()


# 기존 API로 메인 사이트와 저장 전용 글을 준비합니다.
async def create_target(api: AsyncClient, kind: str = "page", root: str = "https://example.com/") -> tuple[str, str, str]:
    customer = (await api.post("/clients", json={"name": "검사 테스트"})).json()
    parent = (await api.post("/sites", json={
        "client_id": customer["id"], "name": "블로그", "url": root, "owner_type": "internal",
    })).json()
    if kind == "site":
        return parent["id"], parent["id"], root
    url = root + "post?lang=ko"
    response = await api.post(f"/sites/{parent['id']}/pages", json={
        "name": "글", "url": url, "notify_search_engines": False,
    })
    assert response.status_code == 201
    return parent["id"], response.json()["page"]["id"], url


# 엔진이 반환하는 실제 불변 결과 타입으로 성공 관측을 구성합니다.
def observation(engine: str, root: str, url: str, checked_at: datetime | None = None) -> GoogleUrlInspection | BingUrlInspection:
    checked = checked_at or datetime.now(timezone.utc)
    if engine == "google":
        return GoogleUrlInspection(
            site_url=root, page_url=url, index_status="indexed", checked_at=checked,
            verdict="PASS", coverage_state="Indexed", last_crawl_time=None,
            page_fetch_state=None, indexing_state=None, robots_txt_state=None,
            google_canonical=url, user_canonical=url, inspection_result_link=None,
        )
    return BingUrlInspection(
        site_url=root, page_url=url, index_status="crawled", checked_at=checked,
        discovery_date=None, last_crawl_time=checked, http_status=200, is_page=True, document_size=100,
    )


# 메인페이지·글 모두 부모 속성을 전달하고 POST 결과를 GET·독립 DB에서 읽습니다.
@pytest.mark.parametrize("kind", ["site", "page"])
@pytest.mark.parametrize("engine_name", ["google", "bing"])
async def test_inspection_roundtrip(
    inspection_api: AsyncClient, migrated_database_url: str, kind: str, engine_name: str,
) -> None:
    parent_id, target_id, url = await create_target(inspection_api, kind)
    result = observation(engine_name, "https://example.com/", url)
    inspector = AsyncMock(return_value=result)

    # 모의 검사 함수를 API에 주입합니다.
    def dependency() -> Inspector:
        return inspector

    app.dependency_overrides[get_inspector] = dependency
    path = f"/sites/{target_id}/inspections"
    assert (await inspection_api.get(path)).json() == {"items": []}
    response = await inspection_api.post(path, json={"engine": engine_name})
    assert response.status_code == 200
    body = response.json()
    assert body["site_id"] == target_id
    assert body["index_status"] == result.index_status
    assert body["last_checked_at"] is not None
    assert body["error_message"] is None
    inspector.assert_awaited_once_with(engine_name, "https://example.com/", url)
    assert (await inspection_api.get(path)).json() == {"items": [body]}
    inspector.assert_awaited_once()
    engine = create_async_engine(migrated_database_url, poolclass=NullPool, hide_parameters=True)
    try:
        async with AsyncSession(engine) as session:
            rows = tuple(await session.scalars(select(SiteEngineStatus).where(
                SiteEngineStatus.site_id == UUID(target_id),
            )))
            assert len(rows) == 1
            assert rows[0].index_status == result.index_status
            assert rows[0].last_checked_at == result.checked_at
            if kind == "page":
                assert tuple(await session.scalars(select(SiteEngineStatus).where(
                    SiteEngineStatus.site_id == UUID(parent_id),
                ))) == ()
    finally:
        await engine.dispose()


# 오류 원문은 노출하지 않고 기존 성공 관측을 보존하며 성공 재조회 시 오류를 지웁니다.
@pytest.mark.parametrize("engine_name", ["google", "bing"])
@pytest.mark.parametrize("code, http_status", [
    ("authentication", 503), ("permission", 502), ("rate_limit", 429),
    ("timeout", 504), ("connection", 502), ("response", 502),
])
async def test_inspection_error_preserves_status(
    inspection_api: AsyncClient, engine_name: str, code: str, http_status: int,
) -> None:
    _, target_id, url = await create_target(inspection_api)
    result = observation(engine_name, "https://example.com/", url)
    error_type = GoogleEngineError if engine_name == "google" else BingEngineError
    inspector = AsyncMock(side_effect=[result, error_type(code, "secret-key-token"), result])

    # 성공·오류·복구를 순서대로 재현합니다.
    def dependency() -> Inspector:
        return inspector

    app.dependency_overrides[get_inspector] = dependency
    path = f"/sites/{target_id}/inspections"
    before = (await inspection_api.post(path, json={"engine": engine_name})).json()
    failed = await inspection_api.post(path, json={"engine": engine_name})
    assert failed.status_code == http_status
    assert failed.json()["detail"]["code"] == f"ENGINE_{code.upper()}"
    assert "secret-key-token" not in failed.text
    stored = (await inspection_api.get(path)).json()["items"][0]
    assert stored["index_status"] == before["index_status"]
    assert stored["last_checked_at"] == before["last_checked_at"]
    assert stored["error_message"] is not None
    assert stored["error_code"] == f"ENGINE_{code.upper()}"
    assert "secret-key-token" not in str(stored)
    recovered = await inspection_api.post(path, json={"engine": engine_name})
    assert recovered.status_code == 200
    assert recovered.json()["error_message"] is None
    assert recovered.json()["error_code"] is None


# 첫 검사 실패도 미색인으로 단정하지 않고 unknown·관측 시각 없음으로 저장합니다.
async def test_first_error_is_unknown(inspection_api: AsyncClient) -> None:
    _, target_id, _ = await create_target(inspection_api)
    inspector = AsyncMock(side_effect=GoogleEngineError("timeout", "secret"))

    # 성공 관측이 없는 첫 실패를 재현합니다.
    def dependency() -> Inspector:
        return inspector

    app.dependency_overrides[get_inspector] = dependency
    path = f"/sites/{target_id}/inspections"
    assert (await inspection_api.post(path, json={"engine": "google"})).status_code == 504
    row = (await inspection_api.get(path)).json()["items"][0]
    assert row["index_status"] == "unknown"
    assert row["last_checked_at"] is None
    assert row["error_message"] is not None
    assert row["error_code"] == "ENGINE_TIMEOUT"


# 안전한 Google 세부 인증 원인은 저장 후 GET으로 읽어도 보존됩니다.
async def test_google_auth_code_is_persisted(inspection_api: AsyncClient) -> None:
    from app.engines.inspection import GoogleInspectionAuthError
    from app.engines.google.google_auth import GoogleAuthError

    _, target_id, _ = await create_target(inspection_api)
    inspector = AsyncMock(side_effect=GoogleInspectionAuthError(GoogleAuthError("secret-key", code="refresh_failed")))

    # 실제 인증 없이 정제된 인증 오류만 반환합니다.
    def dependency() -> Inspector:
        return inspector

    app.dependency_overrides[get_inspector] = dependency
    path = f"/sites/{target_id}/inspections"
    failure = await inspection_api.post(path, json={"engine": "google"})
    assert failure.status_code == 503
    assert failure.json()["detail"]["code"] == "GOOGLE_AUTH_REFRESH_FAILED"
    row = (await inspection_api.get(path)).json()["items"][0]
    assert row["error_code"] == "GOOGLE_AUTH_REFRESH_FAILED"
    assert row["last_checked_at"] is None
    assert "secret-key" not in str(row)


# GET은 검사 의존성을 생성하지 않으며 미존재 대상은 두 메서드 모두 404입니다.
async def test_get_is_read_only_and_missing(inspection_api: AsyncClient) -> None:
    _, target_id, _ = await create_target(inspection_api)

    # GET에서 인증·엔진 준비가 시작되면 실패시킵니다.
    def forbidden_dependency() -> Inspector:
        pytest.fail("GET은 엔진을 준비하지 않습니다.")

    app.dependency_overrides[get_inspector] = forbidden_dependency
    assert (await inspection_api.get(f"/sites/{target_id}/inspections")).json() == {"items": []}
    assert (await inspection_api.get(f"/sites/{uuid4()}/inspections")).status_code == 404
    app.dependency_overrides.pop(get_inspector)
    # 미존재 검증은 실제 인증 함수 호출보다 먼저 수행됩니다.
    assert (await inspection_api.post(f"/sites/{uuid4()}/inspections", json={"engine": "google"})).status_code == 404


# 지원하지 않는 엔진·추가 필드는 외부 호출 전에 거절합니다.
@pytest.mark.parametrize("payload", [{}, {"engine": "naver"}, {"engine": "brave"}, {"engine": "google", "url": "https://other.test/"}])
async def test_inspection_request_validation(inspection_api: AsyncClient, payload: dict[str, str]) -> None:
    response = await inspection_api.post(f"/sites/{uuid4()}/inspections", json=payload)
    assert response.status_code == 422


# 비활성 부모·손상된 부모 관계와 엔진의 지원 범위 밖 URL을 차단합니다.
@pytest.mark.parametrize("scenario, expected", [("inactive", 409), ("outside", 422), ("bing_path", 422)])
async def test_inspection_preconditions(
    inspection_api: AsyncClient, migrated_database_url: str, scenario: str, expected: int,
) -> None:
    root = "https://example.com/blog/" if scenario == "bing_path" else "https://example.com/"
    parent_id, target_id, _ = await create_target(inspection_api, root=root)
    engine = create_async_engine(migrated_database_url, poolclass=NullPool, hide_parameters=True)
    try:
        async with AsyncSession(engine) as session, session.begin():
            if scenario == "inactive":
                await session.execute(update(Site).where(Site.id == UUID(parent_id)).values(is_active=False))
            if scenario == "outside":
                await session.execute(update(Site).where(Site.id == UUID(target_id)).values(url="https://other.test/post"))
        response = await inspection_api.post(f"/sites/{target_id}/inspections", json={
            "engine": "bing" if scenario == "bing_path" else "google",
        })
        assert response.status_code == expected
        assert (await inspection_api.get(f"/sites/{target_id}/inspections")).json()["items"] == []
    finally:
        await engine.dispose()


# 늦게 도착한 오래된 관측이 더 최신의 저장 결과를 덮어쓰지 않습니다.
async def test_older_observation_does_not_replace_newer(inspection_api: AsyncClient) -> None:
    from dataclasses import replace
    from datetime import timedelta

    _, target_id, url = await create_target(inspection_api)
    newer = observation("google", "https://example.com/", url)
    older = replace(newer, checked_at=newer.checked_at - timedelta(seconds=1), index_status="not_indexed")
    inspector = AsyncMock(side_effect=[newer, older])

    # 완료 순서와 관측 시각이 다른 응답을 재현합니다.
    def dependency() -> Inspector:
        return inspector

    app.dependency_overrides[get_inspector] = dependency
    path = f"/sites/{target_id}/inspections"
    first = (await inspection_api.post(path, json={"engine": "google"})).json()
    second = (await inspection_api.post(path, json={"engine": "google"})).json()
    assert second == first
    assert (await inspection_api.get(path)).json() == {"items": [first]}


# 같은 경로에 GET·POST가 모두 공개되고 엔진을 바꿔도 기존 엔진 결과는 유지합니다.
async def test_two_engines_and_openapi(inspection_api: AsyncClient) -> None:
    _, target_id, url = await create_target(inspection_api)
    inspector = AsyncMock(side_effect=[
        observation("google", "https://example.com/", url), observation("bing", "https://example.com/", url),
    ])

    # 엔진별 독립 결과를 제공합니다.
    def dependency() -> Inspector:
        return inspector

    app.dependency_overrides[get_inspector] = dependency
    path = f"/sites/{target_id}/inspections"
    for engine in ("google", "bing"):
        assert (await inspection_api.post(path, json={"engine": engine})).status_code == 200
    rows = (await inspection_api.get(path)).json()["items"]
    assert [row["engine"] for row in rows] == ["bing", "google"]
    schema = (await inspection_api.get("/openapi.json")).json()
    assert {"get", "post"} <= schema["paths"]["/sites/{site_id}/inspections"].keys()
