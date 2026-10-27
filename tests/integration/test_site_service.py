"""임시 PostgreSQL에서 사이트 서비스의 저장·분리 조회·동시 중복을 검증합니다."""

import asyncio
from collections.abc import AsyncIterator
from uuid import UUID, uuid4

import pytest
from sqlalchemy import insert, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.models.site import Site
from app.schemas.client import ClientCreate
from app.schemas.site import SiteCreate, SiteRead
from app.services.client import create_client
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
