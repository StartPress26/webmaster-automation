"""메인 사이트 단위의 사이트맵 제출 API입니다."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.engines.sitemap import SitemapSubmitter, submit_sitemap
from app.schemas.sitemap import SitemapCreate, SitemapRead
from app.services import sitemap as service

router = APIRouter(prefix="/sites", tags=["사이트맵 제출"])


# 실제 제출 함수를 의존성으로 제공합니다.
def get_submitter() -> SitemapSubmitter:
    return submit_sitemap


# 선택한 엔진 하나에 제출하고 접수 성공을 HTTP 200으로 반환합니다.
@router.post(
    "/{main_site_id}/sitemaps", response_model=SitemapRead,
    responses={404: {"description": "메인 사이트 없음"}, 409: {"description": "비활성 사이트"},
               429: {"description": "제출 한도 초과"}, 502: {"description": "검색엔진 제출 오류"},
               503: {"description": "인증 설정 필요"}, 504: {"description": "제출 시간 초과"}},
)
async def create_sitemap_submission(
    main_site_id: UUID, data: SitemapCreate,
    session: Annotated[AsyncSession, Depends(get_db)],
    submitter: Annotated[SitemapSubmitter, Depends(get_submitter)],
) -> SitemapRead:
    try:
        return await service.submit_sitemap(session, main_site_id, data, submitter=submitter)
    except service.SitemapError as error:
        raise HTTPException(status_code=error.http_status, detail={
            "code": error.code, "message": str(error),
        }) from None
