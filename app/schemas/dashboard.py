"""고객사별 등록 글 통계와 메인 사이트의 저장 관측 응답입니다."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.schemas.client import ClientRead
from app.schemas.inspection import InspectionRead


class EngineSummary(BaseModel):
    model_config = ConfigDict(frozen=True)

    indexed: int = 0
    not_indexed: int = 0
    crawled: int = 0
    submitted: int = 0
    failed: int = 0
    unknown: int = 0
    error_count: int = 0
    last_checked_at: datetime | None = None


class MainPageInspection(BaseModel):
    model_config = ConfigDict(frozen=True)

    google: InspectionRead | None = None
    naver: InspectionRead | None = None
    bing: InspectionRead | None = None


class DashboardSite(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    name: str
    url: str
    is_active: bool
    page_count: int
    google: EngineSummary
    naver: EngineSummary
    bing: EngineSummary
    main_page: MainPageInspection


class ClientDashboard(BaseModel):
    model_config = ConfigDict(frozen=True)

    client: ClientRead
    site_count: int
    page_count: int
    google: EngineSummary
    naver: EngineSummary
    bing: EngineSummary
    sites: tuple[DashboardSite, ...]
