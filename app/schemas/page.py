"""개별 글 등록과 저장·발행 알림 결과를 정의합니다."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator

from app.engines.indexnow.schemas import IndexNowUrl
from app.schemas.site import SiteCreate


class PageCreate(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=1)
    url: IndexNowUrl
    notify_search_engines: StrictBool = True

    # 기존 사이트 URL 검증을 재사용해 정규화와 바이트 길이 제한을 적용합니다.
    @field_validator("url")
    @classmethod
    def normalize_url(cls, value: str) -> str:
        return SiteCreate.validate_url(value)


class PageRead(BaseModel):
    model_config = ConfigDict(frozen=True, from_attributes=True)

    id: UUID
    client_id: UUID
    parent_site_id: UUID
    target_type: Literal["page"]
    owner_type: Literal["internal", "client"]
    name: str
    url: str
    is_active: bool
    created_at: datetime


class PageNotification(BaseModel):
    model_config = ConfigDict(frozen=True)

    protocol: Literal["indexnow"] = "indexnow"
    status: Literal["accepted", "key_pending", "failed", "unknown", "skipped"]
    upstream_http_status: int | None = None
    requested_at: datetime | None = None
    error_code: str | None = None


class PageCreateResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    page: PageRead
    submission: PageNotification
