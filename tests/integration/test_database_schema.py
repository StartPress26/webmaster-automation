"""실제 PostgreSQL에서 URL 관계와 등록·색인 상태의 무결성을 검증합니다."""

from dataclasses import dataclass
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import delete, insert, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Client, EngineRegistration, Site, SiteEngineStatus

pytestmark = pytest.mark.integration


@dataclass(frozen=True)
class SampleSites:
    client_id: UUID
    main_id: UUID
    page_id: UUID


@pytest.fixture
async def sample(db_session: AsyncSession) -> SampleSites:
    client_id = await db_session.scalar(
        insert(Client).values(name="테스트 고객사").returning(Client.id)
    )
    main_id = await db_session.scalar(
        insert(Site).values(
            client_id=client_id, target_type="site", name="테스트 블로그",
            url="https://example.com/", owner_type="internal",
            cms_type="custom", can_edit_site=True,
        ).returning(Site.id)
    )
    page_id = await db_session.scalar(
        insert(Site).values(
            client_id=client_id, parent_site_id=main_id, target_type="page",
            name="테스트 글", url="https://example.com/post-a", owner_type="internal",
        ).returning(Site.id)
    )
    assert client_id is not None and main_id is not None and page_id is not None
    return SampleSites(client_id, main_id, page_id)


@pytest.mark.anyio
async def test_page_uses_main_registration_and_own_index_status(
    db_session: AsyncSession, sample: SampleSites
) -> None:
    await db_session.execute(insert(EngineRegistration).values(
        main_site_id=sample.main_id, engine="google", registration_status="verified"
    ))
    await db_session.execute(insert(SiteEngineStatus).values(
        site_id=sample.page_id, engine="google", index_status="crawled"
    ))
    row = (await db_session.execute(
        select(Site.url, EngineRegistration.registration_status, SiteEngineStatus.index_status)
        .join(EngineRegistration, EngineRegistration.main_site_id == Site.parent_site_id)
        .join(SiteEngineStatus, SiteEngineStatus.site_id == Site.id)
        .where(
            Site.id == sample.page_id,
            EngineRegistration.engine == SiteEngineStatus.engine,
        )
    )).one()
    assert tuple(row) == ("https://example.com/post-a", "verified", "crawled")


@pytest.mark.anyio
@pytest.mark.parametrize("registration", [True, False])
async def test_same_target_and_engine_cannot_have_two_statuses(
    db_session: AsyncSession, sample: SampleSites, registration: bool
) -> None:
    statement = (
        insert(EngineRegistration).values(main_site_id=sample.main_id, engine="google")
        if registration
        else insert(SiteEngineStatus).values(site_id=sample.page_id, engine="google")
    )
    await db_session.execute(statement)
    with pytest.raises(IntegrityError):
        async with db_session.begin_nested():
            await db_session.execute(statement)


@pytest.mark.anyio
async def test_page_cannot_have_site_registration(
    db_session: AsyncSession, sample: SampleSites
) -> None:
    with pytest.raises(IntegrityError, match="메인 사이트"):
        async with db_session.begin_nested():
            await db_session.execute(insert(EngineRegistration).values(
                main_site_id=sample.page_id, engine="google"
            ))


@pytest.mark.anyio
@pytest.mark.parametrize("parent_kind", ["page", "missing", "none", "self"])
async def test_page_requires_an_existing_main_parent(
    db_session: AsyncSession, sample: SampleSites, parent_kind: str
) -> None:
    page_id = uuid4()
    parent_id = {
        "page": sample.page_id, "missing": uuid4(), "none": None, "self": page_id
    }[parent_kind]
    with pytest.raises(IntegrityError):
        async with db_session.begin_nested():
            await db_session.execute(insert(Site).values(
                id=page_id, client_id=sample.client_id, parent_site_id=parent_id,
                target_type="page", name="잘못된 글", url="https://example.com/invalid",
                owner_type="client",
            ))


@pytest.mark.anyio
async def test_main_type_cannot_change_after_registration(
    db_session: AsyncSession, sample: SampleSites
) -> None:
    with pytest.raises(IntegrityError, match="유형은 생성 후"):
        async with db_session.begin_nested():
            await db_session.execute(update(Site).where(Site.id == sample.main_id).values(
                target_type="page", parent_site_id=sample.page_id,
                cms_type=None, can_edit_site=None,
            ))


@pytest.mark.anyio
async def test_deleting_main_does_not_silently_delete_posts(
    db_session: AsyncSession, sample: SampleSites
) -> None:
    with pytest.raises(IntegrityError):
        async with db_session.begin_nested():
            await db_session.execute(delete(Site).where(Site.id == sample.main_id))
    assert await db_session.get(Site, sample.page_id) is not None


@pytest.mark.anyio
async def test_internal_site_also_requires_a_client(db_session: AsyncSession) -> None:
    with pytest.raises(IntegrityError):
        async with db_session.begin_nested():
            await db_session.execute(insert(Site).values(
                target_type="site", name="고객 연결 누락", url="https://example.com/",
                owner_type="internal",
            ))


@pytest.mark.anyio
async def test_not_applicable_registration_stays_null_with_orm(
    db_session: AsyncSession, sample: SampleSites
) -> None:
    registration = EngineRegistration(
        main_site_id=sample.main_id, engine="brave", registration_status=None
    )
    db_session.add(registration)
    await db_session.flush()
    await db_session.refresh(registration)
    assert registration.registration_status is None


def test_migration_matches_models_and_can_round_trip(migrated_database_url: str) -> None:
    """임시 테스트 DB에서만 되돌리기와 재적용을 확인합니다."""
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.attributes["database_url"] = migrated_database_url
    command.check(config)
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    command.check(config)
