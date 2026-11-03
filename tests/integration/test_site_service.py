"""임시 PostgreSQL에서 사이트 서비스의 저장·분리 조회·동시 중복을 검증합니다."""

import asyncio
from collections.abc import AsyncIterator
from uuid import UUID, uuid4

import pytest
from sqlalchemy import insert, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.models.site import Site
from app.models.engine_registration import EngineRegistration
from app.schemas.client import ClientCreate
from app.schemas.site import SiteCreate, SiteRead
from app.services.client import create_client
from app.services import site as site_service
from app.services.site import (
    DuplicateSiteError,
    SiteClientNotFoundError,
    create_site,
    list_sites,
)

pytestmark = [pytest.mark.integration, pytest.mark.anyio]


# 실제로 커밋하는 독립 세션을 같은 임시 DB에 연결합니다.
@pytest.fixture
async def site_sessions(
    migrated_database_url: str,
) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(
        migrated_database_url, poolclass=NullPool, hide_parameters=True
    )
    try:
        yield async_sessionmaker(engine, expire_on_commit=False)
    finally:
        await engine.dispose()


# 테스트마다 전용 고객사를 만들어 데이터를 분리합니다.
@pytest.fixture
async def site_client_id(site_sessions: async_sessionmaker[AsyncSession]) -> UUID:
    async with site_sessions() as session:
        client = await create_client(session, ClientCreate(name="사이트 테스트 고객사"))
    return client.id


# 필수 입력과 선택 입력으로 사이트 등록 요청을 만듭니다.
def site_request(client_id: UUID, **changes: object) -> SiteCreate:
    return SiteCreate.model_validate({
        "client_id": client_id,
        "name": "테스트 블로그",
        "url": "https://example.com/blog/",
        "owner_type": "client",
    } | changes)


# 별도 연결에서 저장 결과와 서버 지정값 및 세 상태 보존을 확인합니다.
@pytest.mark.parametrize("can_edit_site", [True, False, None])
async def test_site_is_committed(
    site_sessions: async_sessionmaker[AsyncSession], site_client_id: UUID,
    can_edit_site: bool | None,
) -> None:
    async with site_sessions() as session:
        created = await create_site(
            session, site_request(site_client_id, can_edit_site=can_edit_site)
        )
    async with site_sessions() as session:
        stored = await session.get(Site, created.id)
        assert stored is not None
        assert SiteRead.model_validate(stored) == created
        assert stored.target_type == "site"
        assert stored.parent_site_id is None
        assert stored.is_active is True
        assert stored.can_edit_site is can_edit_site


# 없는 고객사의 등록을 거부하고 실패 후 세션 재사용을 확인합니다.
async def test_missing_client_rolls_back(
    site_sessions: async_sessionmaker[AsyncSession], site_client_id: UUID,
) -> None:
    async with site_sessions() as session:
        with pytest.raises(SiteClientNotFoundError):
            await create_site(session, site_request(uuid4()))
        assert not session.in_transaction()
        await create_site(session, site_request(site_client_id))


# 정규화된 URL 중복을 거부하고 롤백 후 다른 사이트 저장을 확인합니다.
async def test_duplicate_rolls_back(
    site_sessions: async_sessionmaker[AsyncSession], site_client_id: UUID,
) -> None:
    async with site_sessions() as session:
        await create_site(session, site_request(site_client_id))
        with pytest.raises(DuplicateSiteError):
            await create_site(session, site_request(site_client_id, url="HTTPS://EXAMPLE.COM/blog/"))
        assert not session.in_transaction()
        await create_site(session, site_request(site_client_id, url="https://example.com/other/"))


# 고객사 분리·글 제외·정렬·페이지 분할·빈 목록을 확인합니다.
async def test_list_filters_and_paginates(
    site_sessions: async_sessionmaker[AsyncSession], site_client_id: UUID,
) -> None:
    async with site_sessions() as session:
        other = await create_client(session, ClientCreate(name="다른 고객사"))
        first = await create_site(session, site_request(site_client_id))
        second = await create_site(session, site_request(site_client_id, url="https://example.com/second/"))
        other_site = await create_site(session, site_request(other.id))
        async with session.begin():
            await session.execute(insert(Site).values(
                client_id=site_client_id, parent_site_id=first.id, target_type="page",
                name="개별 글", url="https://example.com/blog/post", owner_type="client",
            ))
    async with site_sessions() as session:
        items = await list_sites(session, client_id=site_client_id, limit=100, offset=0)
        assert items == (first, second)
        assert await list_sites(session, client_id=site_client_id, limit=1, offset=1) == (second,)
        assert await list_sites(session, client_id=other.id, limit=100, offset=0) == (other_site,)
        assert await list_sites(session, client_id=uuid4(), limit=100, offset=0) == ()


# 독립 연결에서 동시에 등록해도 한 건만 저장되는지 확인합니다.
async def test_concurrent_duplicate_has_one_winner(
    site_sessions: async_sessionmaker[AsyncSession], site_client_id: UUID,
) -> None:
    # 동일한 등록 정보를 별도 트랜잭션으로 저장합니다.
    async def register() -> SiteRead:
        async with site_sessions() as session:
            return await create_site(session, site_request(site_client_id))

    results = await asyncio.gather(register(), register(), return_exceptions=True)
    assert sum(isinstance(result, SiteRead) for result in results) == 1
    assert sum(isinstance(result, DuplicateSiteError) for result in results) == 1
    async with site_sessions() as session:
        ids = (await session.scalars(select(Site.id).where(Site.client_id == site_client_id))).all()
        assert len(ids) == 1


# 사이트와 두 엔진 설정이 별도 연결에서도 같은 값으로 조회돼야 합니다.
async def test_indexnow_settings_are_committed_with_site(
    site_sessions: async_sessionmaker[AsyncSession], site_client_id: UUID,
) -> None:
    async with site_sessions() as session:
        created = await create_site(session, site_request(
            site_client_id, indexnow_key="a1b2c3d4",
            indexnow_key_location="https://example.com/key.txt",
        ))
    async with site_sessions() as session:
        rows = (await session.scalars(select(EngineRegistration).where(
            EngineRegistration.main_site_id == created.id
        ).order_by(EngineRegistration.engine))).all()
        assert tuple(row.engine for row in rows) == ("bing", "naver")
        assert all(row.indexnow_key == "a1b2c3d4" for row in rows)
        assert all(row.indexnow_key_location == "https://example.com/key.txt" for row in rows)
        assert all(row.registration_status == "unknown" for row in rows)
        assert all(row.last_checked_at is None for row in rows)


# 키를 생략한 기존 등록에서는 엔진 설정 행을 생성하지 않습니다.
async def test_site_without_indexnow_has_no_registration(
    site_sessions: async_sessionmaker[AsyncSession], site_client_id: UUID,
) -> None:
    async with site_sessions() as session:
        created = await create_site(session, site_request(site_client_id))
    async with site_sessions() as session:
        assert (await session.scalars(select(EngineRegistration.id).where(
            EngineRegistration.main_site_id == created.id
        ))).all() == []


# 엔진 행 저장 후 실패해도 사이트와 엔진 설정 모두 롤백돼야 합니다.
async def test_registration_failure_rolls_back_site(
    site_sessions: async_sessionmaker[AsyncSession], site_client_id: UUID,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original = site_service._save_indexnow_settings
    async with site_sessions() as session:
        before_ids = frozenset(await session.scalars(select(EngineRegistration.id)))

    # 실제 두 엔진 행을 저장한 뒤 오류를 발생시켜 트랜잭션 경계를 확인합니다.
    async def fail_after_insert(
        session: AsyncSession, *, main_site_id: UUID, key: str, key_location: str,
    ) -> None:
        await original(session, main_site_id=main_site_id, key=key, key_location=key_location)
        raise RuntimeError("등록 저장 중 테스트 오류")

    monkeypatch.setattr(site_service, "_save_indexnow_settings", fail_after_insert)
    async with site_sessions() as session:
        with pytest.raises(RuntimeError, match="테스트 오류"):
            await create_site(session, site_request(
                site_client_id, indexnow_key="a1b2c3d4",
                indexnow_key_location="https://example.com/key.txt",
            ))
        assert not session.in_transaction()
    async with site_sessions() as session:
        assert (await session.scalars(select(Site.id).where(Site.client_id == site_client_id))).all() == []
        assert frozenset(await session.scalars(select(EngineRegistration.id))) == before_ids


# 동시 설정 교체가 끝나면 두 엔진에는 같은 요청의 완전한 설정만 남아야 합니다.
async def test_concurrent_indexnow_updates_stay_consistent(
    site_sessions: async_sessionmaker[AsyncSession], site_client_id: UUID,
) -> None:
    from app.schemas.indexnow_settings import IndexNowSettingsWrite
    from app.services.indexnow_settings import put_settings

    async with site_sessions() as session:
        site = await create_site(session, site_request(site_client_id))
    settings = (
        IndexNowSettingsWrite(key="a1b2c3d4", key_location="https://example.com/first.txt"),
        IndexNowSettingsWrite(key="deadbeef", key_location="https://example.com/second.txt"),
    )

    # 독립 세션에서 서로 다른 설정을 동시에 저장합니다.
    async def replace(data: IndexNowSettingsWrite) -> None:
        async with site_sessions() as session:
            await put_settings(session, site.id, data)

    await asyncio.gather(*(replace(data) for data in settings))
    async with site_sessions() as session:
        rows = tuple(await session.scalars(select(EngineRegistration).where(
            EngineRegistration.main_site_id == site.id
        )))
        assert len(rows) == 2
        pairs = {(row.indexnow_key, row.indexnow_key_location) for row in rows}
        assert len(pairs) == 1
        assert pairs <= {(data.key, data.key_location) for data in settings}


# 실제 갱신 직후 실패하면 두 엔진 모두 이전 설정으로 롤백돼야 합니다.
async def test_indexnow_update_failure_rolls_back(
    site_sessions: async_sessionmaker[AsyncSession], site_client_id: UUID,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.schemas.indexnow_settings import IndexNowSettingsWrite
    from app.services.indexnow_settings import put_settings

    async with site_sessions() as session:
        site = await create_site(session, site_request(
            site_client_id, indexnow_key="a1b2c3d4",
            indexnow_key_location="https://example.com/key.txt",
        ))
    async with site_sessions() as session:
        original = session.execute

        # 실제 SQL 실행 뒤 예외를 발생시켜 커밋 전 실패를 재현합니다.
        async def fail_after_write(*args: object, **kwargs: object) -> None:
            await original(*args, **kwargs)
            raise RuntimeError("설정 갱신 테스트 오류")

        monkeypatch.setattr(session, "execute", fail_after_write)
        with pytest.raises(RuntimeError, match="설정 갱신 테스트 오류"):
            await put_settings(session, site.id, IndexNowSettingsWrite(
                key="deadbeef", key_location="https://example.com/new.txt",
            ))
        assert not session.in_transaction()
    async with site_sessions() as session:
        rows = tuple(await session.scalars(select(EngineRegistration).where(
            EngineRegistration.main_site_id == site.id
        )))
        assert len(rows) == 2
        assert all(row.indexnow_key == "a1b2c3d4" for row in rows)
        assert all(row.indexnow_key_location == "https://example.com/key.txt" for row in rows)
