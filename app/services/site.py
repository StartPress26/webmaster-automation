"""메인 사이트 저장과 고객사별 목록 조회를 처리합니다."""

from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth_account import AuthAccount
from app.models.client import Client
from app.models.engine_registration import EngineRegistration
from app.models.site import Site
from app.schemas.site import SiteAuthAccountsUpdate, SiteCreate, SiteRead


class SiteClientNotFoundError(Exception):
    """사이트를 등록할 고객사가 존재하지 않습니다."""


class DuplicateSiteError(Exception):
    """같은 고객사에 동일한 URL이 이미 등록돼 있습니다."""


class SiteAuthAccountNotFoundError(Exception):
    """사이트에 연결할 Google·Bing 인증 계정이 존재하지 않습니다."""


class MainSiteNotFoundError(Exception):
    """수정할 메인 사이트가 존재하지 않거나 개별 글입니다."""


# 선택한 계정이 저장 완료 전에 삭제되거나 이메일이 변경되지 않게 보호합니다.
async def _validate_auth_accounts(
    session: AsyncSession, data: SiteCreate | SiteAuthAccountsUpdate,
) -> None:
    for engine, email in (
        ("Google", data.google_account_email), ("Bing", data.bing_account_email),
    ):
        if email is None:
            continue
        account_email = await session.scalar(
            select(AuthAccount.email)
            .where(AuthAccount.email == email)
            .with_for_update(read=True, key_share=True)
        )
        if account_email is None:
            raise SiteAuthAccountNotFoundError(f"{engine} 인증 계정을 찾을 수 없습니다.")


# 같은 IndexNow 설정으로 Naver·Bing 행을 생성하고 커밋은 호출자에게 맡깁니다.
async def _save_indexnow_settings(
    session: AsyncSession, *, main_site_id: UUID, key: str, key_location: str,
) -> None:
    await session.execute(insert(EngineRegistration), tuple(
        {
            "main_site_id": main_site_id,
            "engine": engine,
            "registration_status": "unknown",
            "indexnow_key": key,
            "indexnow_key_location": key_location,
        }
        for engine in ("naver", "bing")
    ))


# 고객사를 확인한 뒤 메인 사이트를 저장하고, 성공하면 트랜잭션을 커밋합니다.
async def create_site(session: AsyncSession, data: SiteCreate) -> SiteRead:
    async with session.begin():
        # 확인과 저장 사이에 고객사가 삭제되지 않도록 키 공유 잠금을 유지합니다.
        client_id = await session.scalar(
            select(Client.id)
            .where(Client.id == data.client_id)
            .with_for_update(read=True, key_share=True)
        )
        if client_id is None:
            raise SiteClientNotFoundError("고객사를 찾을 수 없습니다.")

        await _validate_auth_accounts(session, data)

        site = (
            await session.scalars(
                insert(Site)
                .values(
                    **data.model_dump(exclude={"indexnow_key", "indexnow_key_location"}),
                    target_type="site", parent_site_id=None,
                )
                # DB가 동시 요청까지 판정하며, 다른 제약 오류는 그대로 전달합니다.
                .on_conflict_do_nothing(constraint="uq_sites_client_url") # 같은 고객사에 대해서 같은 URL 또 저장 막기
                .returning(Site)
            )
        ).one_or_none()
        if site is None:
            raise DuplicateSiteError("이 고객사에 이미 등록된 URL입니다.")

        if data.indexnow_key is not None and data.indexnow_key_location is not None:
            await _save_indexnow_settings(
                session, main_site_id=site.id, key=data.indexnow_key,
                key_location=data.indexnow_key_location,
            )

        result = SiteRead.model_validate(site)

    return result


# 기존 메인 사이트의 지정한 계정만 변경하고 전체 작업을 한 번에 커밋합니다.
async def update_auth_accounts(
    session: AsyncSession, site_id: UUID, data: SiteAuthAccountsUpdate,
) -> SiteRead:
    async with session.begin():
        site = await session.scalar(select(Site).where(
            Site.id == site_id, Site.target_type == "site",
        ).with_for_update())
        if site is None:
            raise MainSiteNotFoundError("메인 사이트를 찾을 수 없습니다.")

        await _validate_auth_accounts(session, data)
        changes = data.model_dump(exclude_unset=True)
        if changes:
            site = (await session.scalars(
                update(Site).where(Site.id == site_id).values(**changes)
                .returning(Site).execution_options(populate_existing=True)
            )).one()
        result = SiteRead.model_validate(site)

    return result


# 고객사의 메인 사이트만 생성 시각·ID 순으로 페이지를 나눠 조회합니다.
async def list_sites(
    session: AsyncSession, *, client_id: UUID, limit: int, offset: int
) -> tuple[SiteRead, ...]:
    sites = await session.scalars(
        select(Site)
        .where(Site.client_id == client_id, Site.target_type == "site")
        .order_by(Site.created_at, Site.id)
        .limit(limit)
        .offset(offset)
    )

    return tuple(SiteRead.model_validate(site) for site in sites)
