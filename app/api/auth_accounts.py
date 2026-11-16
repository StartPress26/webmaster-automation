"""인증 계정의 등록과 비밀파일 참조를 제외한 목록 조회 API입니다."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.indexnow_settings import PrivateValidationRoute
from app.core.database import get_db
from app.schemas.auth_account import AuthAccountCreate, AuthAccountList, AuthAccountRead
from app.services import auth_account as service

router = APIRouter(
    prefix="/auth-accounts", tags=["인증 계정"], route_class=PrivateValidationRoute,
)
DatabaseSession = Annotated[AsyncSession, Depends(get_db)]


# 등록 요청을 서비스에 전달하고 중복 이메일은 HTTP 409로 반환합니다.
@router.post(
    "", response_model=AuthAccountRead, status_code=status.HTTP_201_CREATED,
    responses={409: {"description": "이미 등록된 인증 계정 이메일"}},
)
async def create_auth_account(data: AuthAccountCreate, session: DatabaseSession) -> AuthAccountRead:
    try:
        return await service.create_auth_account(session, data)
    except service.DuplicateAuthAccountError as error:
        raise HTTPException(status_code=409, detail={
            "code": "AUTH_ACCOUNT_ALREADY_EXISTS", "message": str(error),
        }) from None


# 페이지 조건에 맞는 계정의 이메일과 엔진별 참조 등록 여부만 반환합니다.
@router.get("", response_model=AuthAccountList)
async def list_auth_accounts(
    session: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AuthAccountList:
    items = await service.list_auth_accounts(session, limit=limit, offset=offset)
    return AuthAccountList(items=items)
