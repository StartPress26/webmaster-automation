"""키 원문을 응답하지 않는 IndexNow 설정 API입니다."""

from collections.abc import Callable, Coroutine
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.indexnow_settings import IndexNowSettingsRead, IndexNowSettingsWrite
from app.services import indexnow_settings as service


class PrivateValidationRoute(APIRoute):
    # 입력 검증 실패 응답에서도 키가 포함된 입력값과 예외 문맥을 제거합니다.
    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        handler = super().get_route_handler()

        # 기본 검증 오류에서 공개 가능한 위치·종류·메시지만 반환합니다.
        async def private_handler(request: Request) -> Response:
            try:
                return await handler(request)
            except RequestValidationError as error:
                raise HTTPException(status_code=422, detail=[
                    {name: item[name] for name in ("loc", "type", "msg")}
                    for item in error.errors()
                ]) from None

        return private_handler


router = APIRouter(prefix="/sites", tags=["IndexNow 설정"], route_class=PrivateValidationRoute)
DatabaseSession = Annotated[AsyncSession, Depends(get_db)]


# 사이트 설정을 추가·교체하고 입력 범위와 대상 오류를 HTTP 오류로 변환합니다.
@router.put("/{main_site_id}/indexnow-settings", response_model=IndexNowSettingsRead)
async def put_settings(
    main_site_id: UUID, data: IndexNowSettingsWrite, session: DatabaseSession,
) -> IndexNowSettingsRead:
    try:
        return await service.put_settings(session, main_site_id, data)
    except service.MainSiteNotFoundError as error:
        raise HTTPException(status_code=404, detail={"code": "MAIN_SITE_NOT_FOUND", "message": str(error)}) from error
    except service.InvalidIndexNowScopeError as error:
        raise HTTPException(status_code=422, detail={"code": "INVALID_INDEXNOW_SCOPE", "message": str(error)}) from error


# 저장된 공통 설정을 조회하고 불일치는 정상 설정으로 표시하지 않습니다.
@router.get("/{main_site_id}/indexnow-settings", response_model=IndexNowSettingsRead)
async def get_settings(main_site_id: UUID, session: DatabaseSession) -> IndexNowSettingsRead:
    try:
        return await service.get_settings(session, main_site_id)
    except service.MainSiteNotFoundError as error:
        raise HTTPException(status_code=404, detail={"code": "MAIN_SITE_NOT_FOUND", "message": str(error)}) from error
    except service.InconsistentIndexNowSettingsError as error:
        raise HTTPException(status_code=409, detail={"code": "INDEXNOW_SETTINGS_INCONSISTENT", "message": str(error)}) from error
