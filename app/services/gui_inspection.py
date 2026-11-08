"""외부 엔진 호출 없이 확장이 전달한 GUI 관측만 검증하고 저장합니다."""

from datetime import datetime, timedelta, timezone
from urllib.parse import unquote, urlsplit
from uuid import UUID

from pydantic import HttpUrl, TypeAdapter, ValidationError
from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.engines.indexnow.schemas import IndexNowUrl
from app.models.site import Site
from app.models.site_engine_status import SiteEngineStatus
from app.schemas.inspection import GuiInspectionCreate, InspectionRead
from app.services.inspection import (
    InspectionInactiveError, InspectionScopeError, InspectionTargetNotFoundError,
)


# 요청 URL을 저장된 대상·부모와 비교하고 사이트 범위 밖의 관측을 거부합니다.
def validate_gui_scope(target: Site, parent: Site, data: GuiInspectionCreate) -> None:
    try:
        validator = TypeAdapter(IndexNowUrl)
        for url in (target.url, parent.url, str(data.site_url), str(data.target_url)):
            validator.validate_python(url)

        main, page = urlsplit(str(HttpUrl(parent.url))), urlsplit(str(HttpUrl(target.url)))
        path = unquote(main.path).rstrip("/")
        if (
            data.site_url != HttpUrl(parent.url) or data.target_url != HttpUrl(target.url)
            or target.client_id != parent.client_id or target.owner_type != parent.owner_type
            or (main.scheme, main.netloc) != (page.scheme, page.netloc)
            or (target.id != parent.id and not unquote(page.path).startswith(path + "/"))
        ):
            raise InspectionScopeError("GUI 결과의 사이트·URL이 저장된 검사 대상과 일치하지 않습니다.")
    except (ValidationError, ValueError):
        raise InspectionScopeError("GUI 결과 또는 저장된 대상의 URL 형식이 올바르지 않습니다.") from None


# 대상 검증과 저장을 한 트랜잭션에서 처리하며 과거·중복 관측은 덮어쓰지 않습니다.
async def save_gui_inspection(
    session: AsyncSession, site_id: UUID, data: GuiInspectionCreate,
) -> InspectionRead:
    server_now = datetime.now(timezone.utc)
    if data.observed_at > server_now + timedelta(minutes=5):
        raise InspectionScopeError("관측 시각이 서버 시각보다 지나치게 미래입니다. 기기 시각을 확인하세요.")

    async with session.begin():
        target = await session.scalar(select(Site).where(Site.id == site_id).with_for_update(read=True))
        if target is None:
            raise InspectionTargetNotFoundError("검사할 사이트·글을 찾을 수 없습니다.")
        parent = target if target.target_type == "site" else await session.scalar(select(Site).where(
            Site.id == target.parent_site_id, Site.target_type == "site",
        ).with_for_update(read=True))
        if parent is None:
            raise InspectionTargetNotFoundError("부모 메인 사이트를 찾을 수 없습니다.")
        if not target.is_active or not parent.is_active:
            raise InspectionInactiveError("비활성 사이트·글은 검사할 수 없습니다.")

        validate_gui_scope(target, parent, data)
        statement = insert(SiteEngineStatus).values(
            site_id=site_id, engine=data.engine, index_status=data.index_status,
            last_checked_at=data.observed_at, error_message=None, error_code=None,
        )
        await session.execute(statement.on_conflict_do_update(
            constraint="uq_site_engine_statuses_site_engine",
            set_={
                "index_status": statement.excluded.index_status,
                "last_checked_at": statement.excluded.last_checked_at,
                "error_message": None,
                "error_code": None,
            },
            where=or_(SiteEngineStatus.last_checked_at.is_(None),
                      SiteEngineStatus.last_checked_at < statement.excluded.last_checked_at),
        ))
        stored = await session.scalar(select(SiteEngineStatus).where(
            SiteEngineStatus.site_id == site_id, SiteEngineStatus.engine == data.engine,
        ))
        return InspectionRead.model_validate(stored)
