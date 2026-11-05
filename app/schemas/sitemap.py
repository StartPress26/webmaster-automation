"""사이트맵 제출 요청과 접수 결과입니다."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

from app.engines.indexnow.schemas import IndexNowUrl
from app.schemas.site import SiteCreate

SitemapEngine = Literal["google", "bing"]


class SitemapCreate(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", str_strip_whitespace=True)

    engine: SitemapEngine
    sitemap_url: IndexNowUrl

    # 기존 HTTP URL 규칙으로 주소를 정규화하고 길이를 제한합니다.
    @field_validator("sitemap_url")
    @classmethod
    def normalize_url(cls, value: str) -> str:
        return SiteCreate.validate_url(value)


class SitemapRead(BaseModel):
    model_config = ConfigDict(frozen=True)

    main_site_id: UUID
    engine: SitemapEngine
    sitemap_url: str
    status: Literal["accepted"] = "accepted"
