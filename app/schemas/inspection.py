"""새 검사 요청과 DB에 저장된 엔진별 최신 상태입니다."""

from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, HttpUrl, model_validator

InspectionEngine = Literal["google", "bing"]


class InspectionCreate(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    engine: InspectionEngine


class GuiInspectionCreate(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    engine: Literal["naver", "bing"]
    site_url: HttpUrl
    target_url: HttpUrl
    index_status: Literal["indexed", "not_indexed", "unknown"]
    queried_at: AwareDatetime
    observed_at: AwareDatetime

    # GUI 판정 범위는 필드 타입으로 제한하고 관측 시각의 순서를 검증합니다.
    @model_validator(mode="after")
    def validate_observation(self) -> Self:
        if self.observed_at < self.queried_at:
            raise ValueError("관측 시각은 검사 시작 시각보다 빠를 수 없습니다.")
        return self


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
