"""임시 PostgreSQL에서 인증 계정 등록·중복·목록 응답을 검증합니다."""

from collections.abc import AsyncIterator

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth_account import AuthAccount
from app.schemas.auth_account import AuthAccountCreate
from app.services.auth_account import (
    DuplicateAuthAccountError, create_auth_account, list_auth_accounts,
)

pytestmark = [pytest.mark.integration, pytest.mark.anyio]


# 서비스의 커밋·롤백을 SAVEPOINT로 격리해 테스트의 외부 트랜잭션을 보존합니다.
@pytest.fixture
async def auth_session(db_session: AsyncSession) -> AsyncIterator[AsyncSession]:
    async with AsyncSession(
        bind=db_session.bind, expire_on_commit=False, join_transaction_mode="create_savepoint",
    ) as session:
        yield session


# 엔진별 참조 등록 여부를 구분하고 실제 저장값이 응답에서 제외되는지 확인합니다.
@pytest.mark.parametrize(("google_ref", "bing_ref"), [
    (None, None), ("google/a.json", None), (None, "bing/a.json"),
    ("google/a.json", "bing/a.json"),
])
async def test_create_auth_account(
    auth_session: AsyncSession, google_ref: str | None, bing_ref: str | None,
) -> None:
    created = await create_auth_account(auth_session, AuthAccountCreate(
        email="user@example.com", google_secret_ref=google_ref, bing_secret_ref=bing_ref,
    ))
    assert created.model_dump() == {
        "email": "user@example.com", "google_configured": google_ref is not None,
        "bing_configured": bing_ref is not None,
    }
    stored = await auth_session.get(AuthAccount, created.email)
    assert stored is not None
    assert stored.google_secret_ref == google_ref
    assert stored.bing_secret_ref == bing_ref


# 중복 등록이 기존 인증 참조를 덮어쓰지 않고 실패 후 세션도 재사용됩니다.
async def test_duplicate_account_preserves_references(auth_session: AsyncSession) -> None:
    await create_auth_account(auth_session, AuthAccountCreate(
        email="user@example.com", google_secret_ref="google/original.json",
    ))
    with pytest.raises(DuplicateAuthAccountError):
        await create_auth_account(auth_session, AuthAccountCreate(
            email="user@example.com", google_secret_ref="google/replacement.json",
        ))
    assert not auth_session.in_transaction()
    await create_auth_account(auth_session, AuthAccountCreate(email="other@example.com"))
    stored = await auth_session.get(AuthAccount, "user@example.com")
    assert stored is not None
    assert stored.google_secret_ref == "google/original.json"


# 목록의 이메일 정렬·페이지 분할·빈 결과와 비밀 참조 제외를 확인합니다.
async def test_list_auth_accounts(auth_session: AsyncSession) -> None:
    last = await create_auth_account(auth_session, AuthAccountCreate(email="z@example.com"))
    first = await create_auth_account(auth_session, AuthAccountCreate(
        email="a@example.com", bing_secret_ref="bing/a.json",
    ))
    assert await list_auth_accounts(auth_session, limit=10, offset=0) == (first, last)
    assert await list_auth_accounts(auth_session, limit=1, offset=1) == (last,)
    assert await list_auth_accounts(auth_session, limit=10, offset=2) == ()
