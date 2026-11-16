"""임시 PostgreSQL에서 고객사별 통계와 고객사 간 데이터 분리를 검증합니다."""

from collections.abc import AsyncIterator
from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dashboard import router
from app.core.database import get_db
from app.models.client import Client
from app.models.site import Site
from app.models.site_engine_status import SiteEngineStatus

pytestmark = [pytest.mark.integration, pytest.mark.anyio]


# 개발 DB 대신 롤백되는 임시 DB 세션을 API에 주입합니다.
@pytest.fixture
async def dashboard_api(db_session: AsyncSession) -> AsyncIterator[AsyncClient]:
    # API 요청에 테스트 전용 세션을 제공합니다.
    async def test_db() -> AsyncIterator[AsyncSession]:
        yield db_session

    application = FastAPI()

    application.include_router(router)

    application.dependency_overrides[get_db] = test_db

    async with AsyncClient(transport=ASGITransport(app=application), base_url="http://test") as client:
        yield client


# 테스트 고객사를 생성하고 서버 UUID를 반환합니다.
async def add_client(session: AsyncSession, name: str = "대시보드 고객사") -> UUID:
    return (await session.scalars(insert(Client).values(name=name).returning(Client.id))).one()


# 메인 사이트 또는 해당 사이트에 속한 글을 임시 DB에 생성합니다.
async def add_target(
    session: AsyncSession, client_id: UUID, parent: UUID | None = None,
    active: bool = True,
) -> UUID:
    return (await session.scalars(insert(Site).values(
        client_id=client_id, parent_site_id=parent, target_type="page" if parent else "site",
        name="테스트 글" if parent else "테스트 블로그", url=f"https://example.com/{uuid4().hex}",
        owner_type="client", is_active=active,
    ).returning(Site.id))).one()


# 엔진 관측과 마지막 오류를 테스트 데이터로 저장합니다.
async def add_status(
    session: AsyncSession, target: UUID, engine: str, status: str,
    checked: datetime | None, error: str | None = None,
) -> None:
    await session.execute(insert(SiteEngineStatus).values(
        site_id=target, engine=engine, index_status=status,
        last_checked_at=checked, error_message=error,
    ))


# 다른 고객사·메인페이지·다른 엔진이 글 통계에 섞이지 않는지 확인합니다.
async def test_dashboard_counts_pages_without_cross_client_or_engine_duplicates(
    dashboard_api: AsyncClient, db_session: AsyncSession,
) -> None:
    client = await add_client(db_session)
    other = await add_client(db_session, "다른 고객사")
    site = await add_target(db_session, client)
    empty_site = await add_target(db_session, client, active=False)
    other_site = await add_target(db_session, other)
    first = await add_target(db_session, client, site)
    second = await add_target(db_session, client, site, active=False)
    third = await add_target(db_session, client, site)
    fourth = await add_target(db_session, client, site)
    fifth = await add_target(db_session, client, site)
    foreign = await add_target(db_session, other, other_site)

    checked = datetime(2026, 11, 4, 1, tzinfo=timezone.utc)
    later = datetime(2026, 11, 4, 2, tzinfo=timezone.utc)

    await add_status(db_session, first, "google", "indexed", checked, "최근 인증 오류")
    await add_status(db_session, first, "bing", "crawled", later)
    await add_status(db_session, second, "google", "not_indexed", checked)
    await add_status(db_session, third, "google", "unknown", None, "첫 검사 실패")
    await add_status(db_session, fourth, "google", "submitted", checked)
    await add_status(db_session, fifth, "google", "crawled", later)
    await add_status(db_session, site, "google", "indexed", later)
    await add_status(db_session, foreign, "google", "indexed", later)
    await add_status(db_session, first, "naver", "indexed", checked, "최근 조회 오류")
    await add_status(db_session, second, "naver", "unknown", later)
    await add_status(db_session, third, "naver", "indexed", None)
    await add_status(db_session, site, "naver", "indexed", later)
    await add_status(db_session, foreign, "naver", "indexed", later)

    response = await dashboard_api.get(f"/clients/{client}/dashboard")
    assert response.status_code == 200

    result = response.json()

    assert result["client"]["id"] == str(client)
    assert result["site_count"] == 2
    assert result["page_count"] == 5
    assert result["google"] == {
        "indexed": 1, "not_indexed": 1, "crawled": 1, "submitted": 1,
        "failed": 0, "unknown": 1, "error_count": 2,
        "last_checked_at": "2026-11-04T02:00:00Z",
    }
    assert result["bing"]["indexed"] == 0
    assert result["bing"]["crawled"] == 1
    assert result["bing"]["unknown"] == 4
    assert result["naver"] == {
        "indexed": 1, "not_indexed": 0, "crawled": 0, "submitted": 0,
        "failed": 0, "unknown": 4, "error_count": 1,
        "last_checked_at": "2026-11-04T02:00:00Z",
    }
    populated = next(row for row in result["sites"] if row["id"] == str(site))
    assert populated["naver"] == result["naver"]
    assert populated["main_page"]["google"]["site_id"] == str(site)
    assert populated["main_page"]["google"]["index_status"] == "indexed"
    assert populated["main_page"]["naver"]["last_checked_at"] == "2026-11-04T02:00:00Z"
    assert populated["main_page"]["bing"] is None

    empty = next(row for row in result["sites"] if row["id"] == str(empty_site))

    assert empty["page_count"] == 0
    assert empty["google"]["unknown"] == 0
    assert empty["google"]["last_checked_at"] is None
    assert empty["naver"]["unknown"] == 0
    assert empty["naver"]["last_checked_at"] is None
    assert not empty["is_active"]
    assert empty["main_page"] == {"google": None, "naver": None, "bing": None}
    assert {row["id"] for row in result["sites"]} == {str(site), str(empty_site)}


# 아직 검사하지 않은 글은 미색인이 아닌 미확인으로 집계합니다.
async def test_uninspected_pages_and_read_only_repeated_requests(
    dashboard_api: AsyncClient, db_session: AsyncSession,
) -> None:
    client = await add_client(db_session)
    site = await add_target(db_session, client)
    await add_target(db_session, client, site)
    before = await db_session.scalar(select(func.count()).select_from(SiteEngineStatus))
    first = await dashboard_api.get(f"/clients/{client}/dashboard")
    second = await dashboard_api.get(f"/clients/{client}/dashboard")
    assert first.json() == second.json()
    assert first.json()["google"]["unknown"] == 1
    assert first.json()["google"]["not_indexed"] == 0
    assert first.json()["bing"]["unknown"] == 1
    assert first.json()["naver"]["unknown"] == 1
    assert first.json()["naver"]["not_indexed"] == 0
    assert first.json()["sites"][0]["main_page"] == {"google": None, "naver": None, "bing": None}
    assert await db_session.scalar(select(func.count()).select_from(SiteEngineStatus)) == before


# 등록 글이 없어도 메인 관측·최근 오류를 반환하고 글 통계와 고객사 범위를 유지합니다.
async def test_main_page_statuses_without_pages_and_latest_observation(
    dashboard_api: AsyncClient, db_session: AsyncSession,
) -> None:
    client = await add_client(db_session)
    other = await add_client(db_session, "다른 고객사")
    site = await add_target(db_session, client, active=False)
    foreign = await add_target(db_session, other)
    checked = datetime(2026, 11, 16, 1, tzinfo=timezone.utc)
    await add_status(db_session, site, "google", "indexed", checked, "최근 조회 실패")
    await add_status(db_session, site, "naver", "unknown", None, "첫 조회 실패")
    await add_status(db_session, site, "bing", "crawled", checked)
    await add_status(db_session, site, "brave", "indexed", checked)
    await add_status(db_session, foreign, "bing", "not_indexed", checked)

    response = await dashboard_api.get(f"/clients/{client}/dashboard")
    assert response.status_code == 200
    result = response.json()
    main_page = result["sites"][0]["main_page"]
    assert set(main_page) == {"google", "naver", "bing"}
    assert main_page["google"]["index_status"] == "indexed"
    assert main_page["google"]["error_message"] == "최근 조회 실패"
    assert main_page["naver"]["last_checked_at"] is None
    assert main_page["naver"]["error_message"] == "첫 조회 실패"
    assert main_page["bing"]["index_status"] == "crawled"
    assert result["page_count"] == 0
    assert result["google"]["indexed"] == result["bing"]["crawled"] == 0
    assert result["google"]["last_checked_at"] is None
    assert len(result["sites"]) == 1

    await db_session.execute(
        SiteEngineStatus.__table__.update().where(
            SiteEngineStatus.site_id == site, SiteEngineStatus.engine == "bing",
        ).values(index_status="indexed", last_checked_at=checked),
    )
    refreshed = (await dashboard_api.get(f"/clients/{client}/dashboard")).json()
    assert refreshed["sites"][0]["main_page"]["bing"]["index_status"] == "indexed"
    assert refreshed["bing"]["indexed"] == 0


# 블로그가 없는 고객사도 빈 통계를 정상 응답합니다.
async def test_client_without_sites(dashboard_api: AsyncClient, db_session: AsyncSession) -> None:
    client = await add_client(db_session)
    response = await dashboard_api.get(f"/clients/{client}/dashboard")
    assert response.status_code == 200
    assert response.json()["site_count"] == 0
    assert response.json()["page_count"] == 0
    assert response.json()["sites"] == []
    assert response.json()["google"]["last_checked_at"] is None
    assert response.json()["naver"]["last_checked_at"] is None
    assert response.json()["naver"]["indexed"] == 0


# 미존재 고객사와 잘못된 UUID 입력을 구분합니다.
async def test_missing_and_invalid_client(dashboard_api: AsyncClient) -> None:
    assert (await dashboard_api.get(f"/clients/{uuid4()}/dashboard")).status_code == 404
    assert (await dashboard_api.get("/clients/invalid/dashboard")).status_code == 422
