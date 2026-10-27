"""메인 사이트의 검색엔진 등록 정보를 저장합니다."""

from uuid import UUID

from sqlalchemy import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.engine_registration import EngineRegistration


# 같은 IndexNow 설정으로 Naver·Bing 행을 생성하고 커밋은 호출자에게 맡깁니다.
async def create_indexnow_registrations(
    session: AsyncSession, *, main_site_id: UUID, key: str, key_location: str,
) -> None:
    await session.execute(insert(EngineRegistration), tuple(
        {
            "main_site_id": main_site_id,
            "engine": engine,
            "registration_status": "unknown",
            "indexnow_key": key,
            "indexnow_key_location": key_location,
        }
        for engine in ("naver", "bing")
    ))
