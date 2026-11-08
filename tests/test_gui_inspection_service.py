"""GUI 관측의 URL 범위와 시각 검증을 외부 연결 없이 확인합니다."""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.models.site import Site
from app.schemas.inspection import GuiInspectionCreate
from app.services.gui_inspection import save_gui_inspection, validate_gui_scope
from app.services.inspection import InspectionScopeError


# 메인 사이트와 글의 소속·경로 검증에 사용할 요청을 구성합니다.
def sample_scope() -> tuple[Site, Site, GuiInspectionCreate]:
    client_id, parent_id = uuid4(), uuid4()
    parent = Site(id=parent_id, client_id=client_id, target_type="site", name="블로그",
                  url="https://example.com/blog/", owner_type="internal", is_active=True)
    target = Site(id=uuid4(), client_id=client_id, parent_site_id=parent_id, target_type="page",
                  name="글", url="https://example.com/blog/post?lang=ko", owner_type="internal", is_active=True)
    data = GuiInspectionCreate.model_validate({
        "engine": "bing", "site_url": parent.url, "target_url": target.url,
        "index_status": "indexed", "queried_at": "2026-11-08T03:00:00Z",
        "observed_at": "2026-11-08T03:00:02Z",
    })
    return target, parent, data


# Bing GUI는 API의 루트 사이트 제한 없이 등록된 하위 경로도 지원합니다.
def test_gui_scope_accepts_subpath_and_main_page() -> None:
    target, parent, data = sample_scope()
    validate_gui_scope(target, parent, data)
    main_data = GuiInspectionCreate.model_validate(data.model_dump() | {"target_url": parent.url})
    validate_gui_scope(parent, parent, main_data)


# 같은 호스트라도 다른 사이트·글·쿼리·인증정보의 관측은 저장하지 않습니다.
@pytest.mark.parametrize("patch", [
    {"site_url": "https://other.example/blog/"},
    {"site_url": "https://example.com/"},
    {"target_url": "https://example.com/blog/other"},
    {"target_url": "https://example.com/blog/post?lang=en"},
    {"target_url": "https://example.com/blog/post?lang=ko#fragment"},
    {"target_url": "https://user:secret@example.com/blog/post?lang=ko"},
])
def test_gui_scope_rejects_mismatched_urls(patch: dict[str, str]) -> None:
    target, parent, data = sample_scope()
    changed = GuiInspectionCreate.model_validate(data.model_dump() | patch)
    with pytest.raises(InspectionScopeError):
        validate_gui_scope(target, parent, changed)


# DB에 저장된 관계도 다른 고객사·소유 구분·경로이면 거부합니다.
@pytest.mark.parametrize("patch", [
    {"client_id": uuid4()}, {"owner_type": "client"},
    {"url": "https://other.example/blog/post"}, {"url": "https://example.com/blog-other/post"},
])
def test_gui_scope_rejects_invalid_stored_scope(patch: dict[str, object]) -> None:
    target, parent, data = sample_scope()
    changed = Site(**({"id": target.id, "client_id": target.client_id,
                      "owner_type": target.owner_type, "url": target.url} | patch))
    with pytest.raises(InspectionScopeError):
        validate_gui_scope(changed, parent, data)


# 먼 미래 시각이 최신 결과를 계속 차단하지 않도록 DB 접근 전에 거부합니다.
@pytest.mark.anyio
@pytest.mark.parametrize("anyio_backend", ["asyncio"])
async def test_gui_save_rejects_future_observation(anyio_backend: str) -> None:
    target, _, data = sample_scope()
    future = datetime.now(timezone.utc) + timedelta(hours=1)
    changed = GuiInspectionCreate.model_validate(data.model_dump() | {
        "queried_at": future, "observed_at": future,
    })
    session = AsyncMock()
    with pytest.raises(InspectionScopeError):
        await save_gui_inspection(session, target.id, changed)
    session.begin.assert_not_called()
