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


# 엔진과 연결 풀을 생성하고 캐시해 이후 요청에서도 재사용합니다.
@lru_cache
def get_engine() -> AsyncEngine:
    return create_async_engine(
        get_settings().database_url,
        # 풀에서 연결을 꺼낼 때 살아 있는지 확인합니다.
        pool_pre_ping=True,
        # SQL 로그와 SQLAlchemy 오류 메시지에서 SQL 매개변수 값을 숨깁니다.
        hide_parameters=True,
    )


# 요청마다 새 세션을 만드는 팩토리만 캐시합니다. 세션 자체를 공유하지 않습니다.
@lru_cache
def get_session_factory() -> async_sessionmaker[AsyncSession]:
    # 커밋 후에도 이미 읽은 객체의 속성을 만료시키지 않습니다.
    return async_sessionmaker(get_engine(), expire_on_commit=False)


# FastAPI에 요청별 세션을 제공하고, 요청 처리가 끝나면 세션을 닫습니다.
async def get_db() -> AsyncIterator[AsyncSession]:
    """요청이 끝나면 세션을 정리합니다. 커밋은 업무 트랜잭션에서 명시합니다."""

    factory = get_session_factory()  # 세션 생성기를 가져옵니다.

    async with factory() as session:  # 요청에 사용할 새 세션을 만듭니다.
        # 세션을 라우터에 전달합니다. 요청 처리 후 async with가 정리합니다.
        yield session


# 앱 종료 시 연결 풀을 정리하고, 엔진과 팩토리 캐시를 비웁니다.
async def dispose_database() -> None:
    """종료 시 이미 만들어진 연결 풀만 정리합니다."""

    # 사용한 적이 없으면 정리를 위해 새 엔진을 만들지 않습니다.
    if get_engine.cache_info().currsize:
        await get_engine().dispose()

    get_session_factory.cache_clear()
    get_engine.cache_clear()
