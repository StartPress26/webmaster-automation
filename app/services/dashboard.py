"""외부 검색엔진 호출 없이 고객사별 글 통계를 집계합니다."""

from collections.abc import Mapping
from typing import Any
from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased
from sqlalchemy.orm.util import AliasedClass
from sqlalchemy.sql.elements import ColumnElement

from app.models.client import Client
from app.models.site import Site
from app.models.site_engine_status import SiteEngineStatus
from app.schemas.client import ClientRead
from app.schemas.dashboard import ClientDashboard, DashboardSite, EngineSummary

STATUSES = ("indexed", "not_indexed", "crawled", "submitted", "failed", "unknown")


class DashboardClientNotFoundError(ValueError):
    """조회할 고객사가 없습니다."""


# 성공 관측이 없는 글은 미확인으로 집계하고 최근 오류는 별도 건수로 계산합니다.
def engine_columns(
    observation: AliasedClass[SiteEngineStatus], page: AliasedClass[Site], prefix: str
) -> tuple[ColumnElement[Any], ...]:
    observed_status = case(
        (observation.last_checked_at.is_(None), "unknown"),
        else_=observation.index_status,
    )
    return (
        *(
            func.count(page.id).filter(observed_status == status).label(f"{prefix}_{status}")
            for status in STATUSES
        ),
        func.count(page.id).filter(observation.error_message.is_not(None)).label(f"{prefix}_error_count"),
        func.max(observation.last_checked_at).label(f"{prefix}_last_checked_at"),
    )


# SQL 집계 결과의 엔진별 필드를 불변 응답으로 변환합니다.
def engine_summary(row: Mapping[str, Any], prefix: str) -> EngineSummary:
    return EngineSummary(**{
        field: row[f"{prefix}_{field}"] for field in EngineSummary.model_fields
    })


# 블로그별 집계를 합산하며 마지막 성공 관측은 가장 최근 시각을 사용합니다.
def total_summary(sites: tuple[DashboardSite, ...], engine: str) -> EngineSummary:
    summaries = tuple(getattr(site, engine) for site in sites)
    checked = tuple(item.last_checked_at for item in summaries if item.last_checked_at)
    return EngineSummary(
        **{field: sum(getattr(item, field) for item in summaries) for field in (*STATUSES, "error_count")},
        last_checked_at=max(checked, default=None),
    )


# 고객사 소속 메인 사이트와 글만 집계하며 비활성 항목도 포함합니다.
async def get_dashboard(session: AsyncSession, client_id: UUID) -> ClientDashboard:
    client = await session.get(Client, client_id)
    if client is None:
        raise DashboardClientNotFoundError("고객사를 찾을 수 없습니다.")

    # aliased - 같은 테이블을 한 쿼리에서 여러 역할로 사용할 때 별명을 붙이는 SQLAlchemy 함수
    page = aliased(Site)
    google = aliased(SiteEngineStatus)
    bing = aliased(SiteEngineStatus)
    rows = (await session.execute(
        select(
            Site.id, Site.name, Site.url, Site.is_active,
            func.count(page.id).label("page_count"),
            *engine_columns(google, page, "google"),
            *engine_columns(bing, page, "bing"),
        )
        .outerjoin(page, (page.parent_site_id == Site.id) & (page.client_id == client_id) & (page.target_type == "page"))
        .outerjoin(google, (google.site_id == page.id) & (google.engine == "google"))
        .outerjoin(bing, (bing.site_id == page.id) & (bing.engine == "bing"))
        .where(Site.client_id == client_id, Site.target_type == "site")
        .group_by(Site.id)
        .order_by(Site.created_at, Site.id)
    )).mappings().all()
    sites = tuple(
        DashboardSite(
            id=row["id"], name=row["name"], url=row["url"], is_active=row["is_active"],
            page_count=row["page_count"], google=engine_summary(row, "google"),
            bing=engine_summary(row, "bing"),
        ) for row in rows
    )
    return ClientDashboard(
        client=ClientRead.model_validate(client), site_count=len(sites),
        page_count=sum(site.page_count for site in sites),
        google=total_summary(sites, "google"), bing=total_summary(sites, "bing"), sites=sites,
    )
