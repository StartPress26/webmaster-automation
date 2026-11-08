"""명시적으로 실행한 경우에만 임시 PostgreSQL DB를 만들어 검증합니다."""

import asyncio
import os
from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import get_settings

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def migration_config(database_url: str) -> Config:
    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    config.attributes["database_url"] = database_url
    return config


async def execute_admin(database_url: str, statement: str) -> None:
    engine = create_async_engine(
        database_url, isolation_level="AUTOCOMMIT", poolclass=NullPool,
        hide_parameters=True,
    )

    try:
        async with engine.connect() as connection:
            await connection.execute(text(statement))
    finally:
        await engine.dispose()


@pytest.fixture(scope="session")
def migrated_database_url() -> Iterator[str]:
    if os.environ.get("RUN_POSTGRES_TESTS") != "1":
        pytest.skip("PostgreSQL 통합 테스트는 RUN_POSTGRES_TESTS=1로 실행하세요.")

    admin_url = get_settings().database_url
    # 이름은 외부 입력 대신 이 테스트에서 생성한 UUID만 사용합니다.
    database_name = f"webmaster_test_{uuid4().hex}"
    database_url = make_url(admin_url).set(database=database_name).render_as_string(
        hide_password=False
    )

    asyncio.run(execute_admin(admin_url, f'CREATE DATABASE "{database_name}"'))

    try:
        command.upgrade(migration_config(database_url), "head")
        yield database_url
    finally:
        # 이 실행에서 생성한 임시 DB만 정리합니다. 개발 DB는 삭제하지 않습니다.
        asyncio.run(execute_admin(admin_url, f'DROP DATABASE "{database_name}"'))


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def db_session(migrated_database_url: str) -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(
        migrated_database_url, poolclass=NullPool, hide_parameters=True
    )

    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()

            try:
                async with AsyncSession(bind=connection, expire_on_commit=False) as session:
                    yield session
            finally:
                await transaction.rollback()
    finally:
        await engine.dispose()
