"""고객사 등록 및 목록 조회 API입니다."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.client import ClientCreate, ClientList, ClientRead
from app.services import client as client_service

router = APIRouter(prefix="/clients", tags=["고객사"])
# DB 세션을 주입받는 타입 별칭: FastAPI가 get_db를 실행해 세션을 전달합니다.
DatabaseSession = Annotated[AsyncSession, Depends(get_db)]


# 검증된 고객사 정보를 서비스에 전달하고 등록 결과를 HTTP 201로 반환합니다.
@router.post("", response_model=ClientRead, status_code=status.HTTP_201_CREATED)
async def create_client(data: ClientCreate, session: DatabaseSession) -> ClientRead:
    return await client_service.create_client(session, data)


# limit·offset에 따라 고객사 목록을 조회하고 목록 응답으로 반환합니다.
@router.get("", response_model=ClientList)
async def list_clients(
    session: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ClientList:
    items = await client_service.list_clients(session, limit=limit, offset=offset)
    return ClientList(items=items)
