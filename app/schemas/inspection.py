"""새 검사 요청과 DB에 저장된 엔진별 최신 상태입니다."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

InspectionEngine = Literal["google", "bing"]


class InspectionCreate(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    engine: InspectionEngine


class InspectionRead(BaseModel):
    model_config = ConfigDict(frozen=True, from_attributes=True)

    site_id: UUID
    engine: Literal["google", "bing", "naver", "brave"]
    index_status: Literal["unknown", "submitted", "crawled", "indexed", "not_indexed", "failed"]
    last_checked_at: datetime | None
    next_check_at: datetime | None
    error_message: str | None
    error_code: str | None = None


class InspectionList(BaseModel):
    model_config = ConfigDict(frozen=True)

    items: tuple[InspectionRead, ...]
