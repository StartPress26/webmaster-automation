"""선택한 고객사의 대시보드를 제공합니다."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.dashboard import ClientDashboard
from app.services.dashboard import DashboardClientNotFoundError, get_dashboard

router = APIRouter(prefix="/clients", tags=["대시보드"])
DatabaseSession = Annotated[AsyncSession, Depends(get_db)]


# 선택 고객사의 블로그별 글 통계를 읽고 미존재 고객사는 404로 반환합니다.
@router.get("/{client_id}/dashboard", response_model=ClientDashboard)
async def read_dashboard(client_id: UUID, session: DatabaseSession) -> ClientDashboard:
    try:
        return await get_dashboard(session, client_id)
    except DashboardClientNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
