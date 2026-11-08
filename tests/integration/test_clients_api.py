"""임시 PostgreSQL에서 고객사 API의 저장과 요청 간 영속성을 확인합니다."""

from collections.abc import AsyncIterator
from uuid import UUID

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.api.clients import router
from app.core.database import get_db
from app.models.client import Client

pytestmark = [pytest.mark.integration, pytest.mark.anyio]


@pytest.fixture
async def client_api(migrated_database_url: str) -> AsyncIterator[AsyncClient]:
    engine = create_async_engine(
        migrated_database_url, poolclass=NullPool, hide_parameters=True
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async def test_db() -> AsyncIterator[AsyncSession]:
        async with sessions() as session:
            yield session

    application = FastAPI()

    application.include_router(router)

    application.dependency_overrides[get_db] = test_db

    try:
        async with AsyncClient(
            transport=ASGITransport(app=application), base_url="http://test"
        ) as client:
            yield client
    finally:
        await engine.dispose()


async def test_created_client_is_committed_and_listed(
    client_api: AsyncClient, migrated_database_url: str
) -> None:
    response = await client_api.post(
        "/clients", json={"name": "  테스트 고객사  ", "manager_name": "  김담당  "}
    )
    assert response.status_code == 201

    created = response.json()
    client_id = UUID(created["id"])

    assert created["name"] == "테스트 고객사"
    assert created["manager_name"] == "김담당"
    assert created["created_at"] is not None

    # 별도의 연결에서도 보여야 요청 종료 후 실제로 커밋된 것입니다.
    engine = create_async_engine(
        migrated_database_url, poolclass=NullPool, hide_parameters=True
    )

    try:
        async with AsyncSession(engine) as session:
            stored_name = await session.scalar(select(Client.name).where(Client.id == client_id))
            assert stored_name == "테스트 고객사"
    finally:
        await engine.dispose()

    listing = await client_api.get("/clients")
    assert listing.status_code == 200
    assert created in listing.json()["items"]


async def test_manager_can_be_omitted(client_api: AsyncClient) -> None:
    response = await client_api.post("/clients", json={"name": "담당자 없는 고객사"})
    assert response.status_code == 201
    assert response.json()["manager_name"] is None


@pytest.mark.parametrize("payload", [{}, {"name": " \t "}, {"name": None}])
async def test_invalid_client_does_not_create_a_row(
    client_api: AsyncClient, payload: dict[str, object]
) -> None:
    before = (await client_api.get("/clients")).json()
    response = await client_api.post("/clients", json=payload)
    assert response.status_code == 422
    assert (await client_api.get("/clients")).json() == before


async def test_listing_supports_pagination(client_api: AsyncClient) -> None:
    for name in ("페이지 검증 A", "페이지 검증 B"):
        assert (await client_api.post("/clients", json={"name": name})).status_code == 201

    items = (await client_api.get("/clients")).json()["items"]

    page = await client_api.get("/clients", params={"limit": 1, "offset": 1})
    assert page.status_code == 200
    assert page.json()["items"] == items[1:2]
    assert (await client_api.get("/clients", params={"limit": 0})).status_code == 422
    assert (await client_api.get("/clients", params={"offset": -1})).status_code == 422
