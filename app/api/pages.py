"""개별 글 저장과 명시적인 기존 글 발행 알림을 처리합니다."""

from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.engines.indexnow.client import IndexNowClient
from app.schemas.page import PageCreate, PageCreateResult, PageList, PageNotificationRequest
from app.services import page as service

router = APIRouter(prefix="/sites", tags=["개별 글"])
DatabaseSession = Annotated[AsyncSession, Depends(get_db)]


# IndexNow에 사용할 전용 클라이언트는 요청 종료 시 닫으며 다른 서비스의 인증·재시도 설정을 공유하지 않습니다.
async def get_indexnow_client() -> AsyncIterator[IndexNowClient]:
    async with httpx.AsyncClient() as http_client:
        yield IndexNowClient(http_client)


# 글 생성 성공은 201로 반환하고 알림 성공·실패는 응답 본문에서 구분합니다.
@router.post(
    "/{main_site_id}/pages", response_model=PageCreateResult, status_code=201,
    responses={404: {"description": "부모 메인 사이트 없음"}, 409: {"description": "중복 URL 또는 비활성 부모"}},
)
async def create_page(
    main_site_id: UUID, data: PageCreate, session: DatabaseSession,
    client: Annotated[IndexNowClient, Depends(get_indexnow_client)],
) -> PageCreateResult:
    try:
        return await service.create_page(session, main_site_id, data, client=client)
    except service.PageParentNotFoundError as error:
        raise HTTPException(status_code=404, detail={"code": "MAIN_SITE_NOT_FOUND", "message": str(error)}) from error
    except service.PageParentInactiveError as error:
        raise HTTPException(status_code=409, detail={"code": "SITE_INACTIVE", "message": str(error)}) from error
    except service.DuplicatePageError as error:
        raise HTTPException(status_code=409, detail={"code": "DUPLICATE_PAGE", "message": str(error)}) from error
    except service.PageUrlScopeError as error:
        raise HTTPException(status_code=422, detail={"code": "INVALID_PAGE_SCOPE", "message": str(error)}) from error


# 외부 페이지의 일반 폼 제출로 재알림이 실행되지 않도록 JSON 요청만 허용합니다.
async def require_notification_json(request: Request) -> None:
    media_type = request.headers.get("content-type", "").partition(";")[0].strip().lower()
    if media_type != "application/json":
        raise HTTPException(status_code=415, detail={
            "code": "JSON_REQUIRED", "message": "기존 글 알림은 JSON 요청으로만 실행할 수 있습니다.",
        })


# 기존 글은 다시 저장하지 않고 확인한 URL의 IndexNow 알림 접수만 한 번 실행합니다.
@router.post(
    "/{main_site_id}/pages/{page_id}/notifications", response_model=PageCreateResult,
    dependencies=[Depends(require_notification_json)],
    responses={
        404: {"description": "부모 메인 사이트 또는 소속 글 없음"},
        409: {"description": "비활성 사이트·글 또는 확인한 URL 변경"},
        415: {"description": "JSON 요청 필요"},
        422: {"description": "글 URL 범위 오류"},
    },
)
async def notify_existing_page(
    main_site_id: UUID, page_id: UUID, data: PageNotificationRequest, session: DatabaseSession,
    client: Annotated[IndexNowClient, Depends(get_indexnow_client)],
) -> PageCreateResult:
    try:
        return await service.notify_existing_page(
            session, main_site_id, page_id, expected_url=data.expected_url, client=client,
        )
    except service.PageParentNotFoundError as error:
        raise HTTPException(status_code=404, detail={"code": "MAIN_SITE_NOT_FOUND", "message": str(error)}) from error
    except service.PageNotFoundError as error:
        raise HTTPException(status_code=404, detail={"code": "PAGE_NOT_FOUND", "message": str(error)}) from error
    except (service.PageParentInactiveError, service.PageInactiveError) as error:
        raise HTTPException(status_code=409, detail={"code": "SITE_INACTIVE", "message": str(error)}) from error
    except service.PageUrlChangedError as error:
        raise HTTPException(status_code=409, detail={"code": "PAGE_URL_CHANGED", "message": str(error)}) from error
    except service.PageUrlScopeError as error:
        raise HTTPException(status_code=422, detail={"code": "INVALID_PAGE_SCOPE", "message": str(error)}) from error


# 외부 호출 없이 부모 사이트의 저장된 글 목록을 페이지 단위로 반환합니다.
@router.get(
    "/{main_site_id}/pages", response_model=PageList,
    responses={404: {"description": "부모 메인 사이트 없음"}},
)
async def list_pages(
    main_site_id: UUID, session: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PageList:
    try:
        return PageList(items=await service.list_pages(
            session, main_site_id, limit=limit, offset=offset,
        ))
    except service.PageParentNotFoundError as error:
        raise HTTPException(status_code=404, detail={"code": "MAIN_SITE_NOT_FOUND", "message": str(error)}) from error
