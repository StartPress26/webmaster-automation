"""비동기 연결 풀과 요청별 세션을 제공합니다."""

from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings


@lru_cache
def get_engine() -> AsyncEngine:
    return create_async_engine(
        get_settings().database_url,
        pool_pre_ping=True,
        hide_parameters=True,
    )


@lru_cache
def get_session_factory() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(), expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    """요청이 끝나면 세션을 정리합니다. 커밋은 업무 트랜잭션에서 명시합니다."""
    async with get_session_factory()() as session:
        yield session


async def dispose_database() -> None:
    """종료 시 이미 만들어진 연결 풀만 정리합니다."""
    if get_engine.cache_info().currsize:
        await get_engine().dispose()
    get_session_factory.cache_clear()
    get_engine.cache_clear()
