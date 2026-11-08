"""GUI 검사 결과 저장 요청의 판정과 관측 시각을 검증합니다."""

import pytest
from pydantic import ValidationError

from app.schemas.inspection import GuiInspectionCreate


# 엔진별 지원 판정과 시간대가 있는 관측 결과를 허용합니다.
@pytest.mark.parametrize("engine,status", [
    ("naver", "indexed"), ("naver", "unknown"),
    ("bing", "indexed"), ("bing", "not_indexed"), ("bing", "unknown"),
])
def test_gui_observation_accepts_supported_status(engine: str, status: str) -> None:
    observation = GuiInspectionCreate.model_validate({
        "engine": engine, "site_url": "https://example.com/",
        "target_url": "https://example.com/post/1", "index_status": status,
        "queried_at": "2026-11-08T03:00:00Z", "observed_at": "2026-11-08T03:00:02Z",
    })

    assert observation.engine == engine
    assert observation.index_status == status


# 지원하지 않는 판정·URL·시각과 정의하지 않은 필드를 거부합니다.
@pytest.mark.parametrize("patch", [
    {"engine": "google"},
    {"engine": "naver", "index_status": "not_indexed"},
    {"index_status": "crawled"},
    {"site_url": "ftp://example.com/"},
    {"target_url": "invalid"},
    {"queried_at": "2026-11-08T03:00:00"},
    {"observed_at": "2026-11-08T03:00:02"},
    {"observed_at": "2026-11-08T02:59:59Z"},
    {"unexpected": True},
])
def test_gui_observation_rejects_invalid_payload(patch: dict[str, object]) -> None:
    payload = {
        "engine": "bing", "site_url": "https://example.com/",
        "target_url": "https://example.com/post/1", "index_status": "indexed",
        "queried_at": "2026-11-08T03:00:00Z", "observed_at": "2026-11-08T03:00:02Z",
    } | patch

    with pytest.raises(ValidationError):
        GuiInspectionCreate.model_validate(payload)
