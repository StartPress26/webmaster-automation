"""메인 사이트의 Naver·Bing 공통 설정을 원자적으로 관리합니다."""

from urllib.parse import urlsplit
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.engines.indexnow.schemas import IndexNowRequest
from app.models.engine_registration import EngineRegistration
from app.models.site import Site
from app.schemas.indexnow_settings import IndexNowSettingsRead, IndexNowSettingsWrite


class MainSiteNotFoundError(Exception):
    """메인 사이트가 없거나 개별 글을 지정했습니다."""


class InvalidIndexNowScopeError(Exception):
    """설정이 메인 사이트의 호스트·경로 범위를 벗어났습니다."""


class InconsistentIndexNowSettingsError(Exception):
    """두 엔진의 저장 설정이 불완전하거나 서로 다릅니다."""


# 사이트 행 잠금으로 설정 변경끼리 직렬화하고 조회 중 일관성도 유지합니다.
async def _get_main_site(session: AsyncSession, site_id: UUID, *, write: bool) -> Site:
    site = await session.scalar(select(Site).where(
        Site.id == site_id, Site.target_type == "site",
    ).with_for_update(read=not write))
    # 찾은 사이트에 설정을 동시에 바꾸는 것을 막기 위해 lock을 건다.
    if site is None:
        raise MainSiteNotFoundError("메인 사이트를 찾을 수 없습니다.")

    return site


# 검증된 설정을 두 엔진에 함께 저장하며 기존 등록·확인 상태는 유지합니다.
async def put_settings(
    session: AsyncSession, site_id: UUID, data: IndexNowSettingsWrite,
) -> IndexNowSettingsRead:
    # session -> DB 작업을 하나의 트랜잭션으로 만든 것
    async with session.begin():
        site = await _get_main_site(session, site_id, write=True)

        try:
            # 검증
            IndexNowRequest(
                host=urlsplit(site.url).hostname or "", key=data.key,
                key_location=data.key_location, urls=(site.url,),
            )
        except ValidationError:
            raise InvalidIndexNowScopeError(
                "키 파일의 호스트·적용 경로가 메인 사이트와 일치해야 합니다."
            ) from None

        statement = insert(EngineRegistration).values(tuple(
            {
                "main_site_id": site_id, "engine": engine,
                "registration_status": "unknown", "indexnow_key": data.key,
                "indexnow_key_location": data.key_location,
            }
            for engine in ("bing", "naver")
        ))

        # on_conflict_do_update 이미 있으면 삽입이 아닌 업데이트
        await session.execute(statement.on_conflict_do_update(
            constraint="uq_engine_registrations_site_engine",
            set_={
                "indexnow_key": statement.excluded.indexnow_key,
                "indexnow_key_location": statement.excluded.indexnow_key_location,
            },
        ))

    return IndexNowSettingsRead(configured=True, key_location=data.key_location)


# 두 엔진 설정의 일치 여부를 확인하고 키 원문 없이 설정 상태를 반환합니다.
async def get_settings(session: AsyncSession, site_id: UUID) -> IndexNowSettingsRead:
    async with session.begin():
        await _get_main_site(session, site_id, write=False)

        rows = tuple(await session.scalars(select(EngineRegistration).where(
            EngineRegistration.main_site_id == site_id,
            EngineRegistration.engine.in_(("bing", "naver")),
        )))
        #  설정이 없으면 미설정 값을 반환
        if not rows or all(
            row.indexnow_key is None and row.indexnow_key_location is None for row in rows
        ):
            return IndexNowSettingsRead(configured=False, key_location=None)
        if (
            # naver, bing 2개의 행이 존재해야 한다.
            len(rows) != 2
            or any(not row.indexnow_key or not row.indexnow_key_location for row in rows)
            # set에 넣어서 중복을 제거 했을 때 1개여야 한다.
            or len({(row.indexnow_key, row.indexnow_key_location) for row in rows}) != 1
        ):
            raise InconsistentIndexNowSettingsError("Naver·Bing의 IndexNow 설정이 일치하지 않습니다.")

        return IndexNowSettingsRead(configured=True, key_location=rows[0].indexnow_key_location)
