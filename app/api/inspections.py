"""같은 inspections 경로에서 새 검사와 저장 결과 조회를 구분합니다."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.engines.inspection import Inspector, inspect_url
from app.schemas.inspection import InspectionCreate, InspectionList, InspectionRead
from app.services import inspection as service

router = APIRouter(prefix="/sites", tags=["수집·색인 상태 검사"])
DatabaseSession = Annotated[AsyncSession, Depends(get_db)]


# 실제 엔진 조회 함수를 주입하며 GET에는 이 의존성을 사용하지 않습니다.
def get_inspector() -> Inspector:
    return inspect_url


# 최신 상태를 외부에서 조회하고 저장한 엔진별 결과를 반환합니다.
@router.post(
    "/{site_id}/inspections", response_model=InspectionRead,
    responses={404: {"description": "대상 없음"}, 409: {"description": "비활성 대상"},
               429: {"description": "조회 한도 초과"}, 502: {"description": "검색엔진 조회 오류"},
               503: {"description": "인증 설정 필요"}, 504: {"description": "조회 시간 초과"}},
)
async def create_inspection(
    site_id: UUID, data: InspectionCreate, session: DatabaseSession,
    inspector: Annotated[Inspector, Depends(get_inspector)],
) -> InspectionRead:
    try:
        return await service.run_inspection(session, site_id, data.engine, inspector=inspector)
    except service.InspectionTargetNotFoundError as error:
        raise HTTPException(status_code=404, detail={"code": "TARGET_NOT_FOUND", "message": str(error)}) from error
    except service.InspectionInactiveError as error:
        raise HTTPException(status_code=409, detail={"code": "SITE_INACTIVE", "message": str(error)}) from error
    except service.InspectionScopeError as error:
        raise HTTPException(status_code=422, detail={"code": "INVALID_INSPECTION_SCOPE", "message": str(error)}) from error
    except service.InspectionUpstreamError as error:
        raise HTTPException(status_code=error.http_status, detail={"code": error.code, "message": str(error)}) from error


# 외부 요청 없이 대상 URL의 엔진별 최신 저장 상태를 반환합니다.
@router.get("/{site_id}/inspections", response_model=InspectionList)
async def list_inspections(site_id: UUID, session: DatabaseSession) -> InspectionList:
    try:
        return InspectionList(items=await service.list_inspections(session, site_id))
    except service.InspectionTargetNotFoundError as error:
        raise HTTPException(status_code=404, detail={"code": "TARGET_NOT_FOUND", "message": str(error)}) from error
