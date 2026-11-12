"""인증 계정을 관리하고 서버 내부에서 사용할 비밀파일 참조를 조회합니다."""

from typing import Literal

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth_account import AuthAccount
from app.schemas.auth_account import AuthAccountCreate, AuthAccountRead


class DuplicateAuthAccountError(Exception):
    """동일한 이메일의 인증 계정이 이미 등록돼 있습니다."""


class AuthAccountNotFoundError(Exception):
    """요청한 이메일의 인증 계정이 없습니다."""


class SecretReferenceNotFoundError(Exception):
    """인증 계정에 해당 엔진의 비밀파일 참조가 없습니다."""


# 이메일과 엔진에 해당하는 파일 참조만 조회하며 파일 접근과 트랜잭션 종료는 하지 않습니다.
async def get_secret_reference(
    session: AsyncSession, *, email: str, engine: Literal["google", "bing"],
) -> str:
    if engine not in {"google", "bing"}:
        raise ValueError("지원하지 않는 인증 엔진입니다.")

    account = await session.scalar(select(AuthAccount).where(AuthAccount.email == email))
    if account is None:
        raise AuthAccountNotFoundError("등록된 인증 계정이 없습니다.")

    reference = account.google_secret_ref if engine == "google" else account.bing_secret_ref
    if not reference or not reference.strip():
        raise SecretReferenceNotFoundError("해당 엔진의 비밀파일 참조가 등록되지 않았습니다.")

    return reference


# 실제 파일을 읽지 않고 비밀파일 참조의 등록 여부만 응답으로 변환합니다.
def _to_read(account: AuthAccount) -> AuthAccountRead:
    return AuthAccountRead(
        email=account.email,
        google_configured=bool(account.google_secret_ref),
        bing_configured=bool(account.bing_secret_ref),
    )


# 이메일 중복을 DB에서 판정하고 등록 성공 시 트랜잭션을 커밋합니다.
async def create_auth_account(session: AsyncSession, data: AuthAccountCreate) -> AuthAccountRead:
    async with session.begin():
        account = (await session.scalars(
            insert(AuthAccount)
            .values(**data.model_dump())
            .on_conflict_do_nothing(index_elements=[AuthAccount.email])
            .returning(AuthAccount)
        )).one_or_none()
        if account is None:
            raise DuplicateAuthAccountError("이미 등록된 인증 계정 이메일입니다.")
        result = _to_read(account)

    return result


# 이메일 오름차순으로 페이지를 나누고 비밀파일 참조 없이 반환합니다.
async def list_auth_accounts(
    session: AsyncSession, *, limit: int, offset: int,
) -> tuple[AuthAccountRead, ...]:
    accounts = await session.scalars(
        select(AuthAccount).order_by(AuthAccount.email).limit(limit).offset(offset)
    )
    return tuple(_to_read(account) for account in accounts)
