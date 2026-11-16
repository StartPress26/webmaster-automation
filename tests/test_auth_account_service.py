"""외부 DB·파일 접근 없이 인증 계정 참조 선택과 누락 처리를 검증합니다."""

from typing import Literal
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth_account import AuthAccount
from app.services.auth_account import (
    AuthAccountNotFoundError,
    SecretReferenceNotFoundError,
    get_secret_reference,
)

pytestmark = pytest.mark.anyio


# 테스트가 asyncio에서만 실행되도록 백엔드를 지정합니다.
@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


# 이메일 조건으로 조회하고 요청한 엔진의 참조만 반환하며 세션을 종료하지 않습니다.
@pytest.mark.parametrize("engine", ["google", "bing"])
async def test_get_secret_reference(engine: Literal["google", "bing"]) -> None:
    session = AsyncMock(spec=AsyncSession)
    session.scalar.return_value = AuthAccount(
        email="user@example.com", google_secret_ref="google/user@example.com.json",
        bing_secret_ref="bing/user@example.com.json",
    )

    assert await get_secret_reference(
        session, email="user@example.com", engine=engine,
    ) == f"{engine}/user@example.com.json"

    statement = session.scalar.call_args.args[0].compile()
    assert "auth_accounts.email =" in str(statement)
    assert "user@example.com" in statement.params.values()
    session.commit.assert_not_awaited()
    session.rollback.assert_not_awaited()


# 없는 계정은 파일 참조 누락과 구분하고 이메일을 오류에 노출하지 않습니다.
async def test_account_not_found() -> None:
    session = AsyncMock(spec=AsyncSession)
    session.scalar.return_value = None

    with pytest.raises(AuthAccountNotFoundError) as caught:
        await get_secret_reference(session, email="private@example.com", engine="google")

    assert "private@example.com" not in str(caught.value)


# 참조가 비어 있어도 다른 엔진의 참조로 대체하지 않습니다.
@pytest.mark.parametrize("engine", ["google", "bing"])
@pytest.mark.parametrize("reference", [None, "", "   "])
async def test_reference_not_found(
    engine: Literal["google", "bing"], reference: str | None,
) -> None:
    session = AsyncMock(spec=AsyncSession)
    session.scalar.return_value = AuthAccount(
        email="user@example.com",
        google_secret_ref=reference if engine == "google" else "google/other.json",
        bing_secret_ref=reference if engine == "bing" else "bing/other.json",
    )

    with pytest.raises(SecretReferenceNotFoundError):
        await get_secret_reference(session, email="user@example.com", engine=engine)


# 타입 힌트를 거친 잘못된 엔진도 DB 접근 전에 거부합니다.
async def test_invalid_engine() -> None:
    session = AsyncMock(spec=AsyncSession)

    with pytest.raises(ValueError, match="지원하지 않는"):
        await get_secret_reference(
            session, email="user@example.com", engine="naver",  # type: ignore[arg-type]
        )

    session.scalar.assert_not_awaited()
