"""메인 사이트 등록 및 고객사별 목록 조회 API입니다."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.site import SiteAuthAccountsUpdate, SiteCreate, SiteList, SiteRead
from app.services import site as site_service

router = APIRouter(prefix="/sites", tags=["사이트"])
DatabaseSession = Annotated[AsyncSession, Depends(get_db)]


# 검증된 메인 사이트를 등록하고 서비스 예외를 HTTP 오류로 변환합니다.
@router.post(
    "", response_model=SiteRead, status_code=status.HTTP_201_CREATED,
    responses={404: {"description": "고객사 또는 연결할 인증 계정 없음"}},
)
async def create_site(data: SiteCreate, session: DatabaseSession) -> SiteRead:
    try:
        return await site_service.create_site(session, data)
    except site_service.SiteClientNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(error)
        ) from error
    except site_service.DuplicateSiteError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(error)
        ) from error
    except site_service.SiteAuthAccountNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "AUTH_ACCOUNT_NOT_FOUND", "message": str(error)},
        ) from None


# 기존 메인 사이트의 계정을 부분 변경하며 생략과 연결 해제를 구분합니다.
@router.patch(
    "/{site_id}/auth-accounts", response_model=SiteRead,
    responses={404: {"description": "메인 사이트 또는 연결할 인증 계정 없음"}},
)
async def update_auth_accounts(
    site_id: UUID, data: SiteAuthAccountsUpdate, session: DatabaseSession,
) -> SiteRead:
    try:
        return await site_service.update_auth_accounts(session, site_id, data)
    except site_service.MainSiteNotFoundError as error:
        raise HTTPException(status_code=404, detail={
            "code": "MAIN_SITE_NOT_FOUND", "message": str(error),
        }) from None
    except site_service.SiteAuthAccountNotFoundError as error:
        raise HTTPException(status_code=404, detail={
            "code": "AUTH_ACCOUNT_NOT_FOUND", "message": str(error),
        }) from None


# 고객사 ID와 페이지 조건에 맞는 메인 사이트 목록을 반환합니다.
@router.get("", response_model=SiteList)
async def list_sites(
    session: DatabaseSession,
    client_id: Annotated[UUID, Query()],
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> SiteList:
    items = await site_service.list_sites(
        session, client_id=client_id, limit=limit, offset=offset
    )
    return SiteList(items=items)
