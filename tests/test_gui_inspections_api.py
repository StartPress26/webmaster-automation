"""DB 없이 GUI 저장 경로의 요청 검증과 서비스 오류 응답을 검증합니다."""

from collections.abc import Iterator
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.inspections import get_inspector
from app.core.database import get_db
from app.main import app
from app.schemas.inspection import InspectionRead
from app.services.inspection import (
    InspectionInactiveError, InspectionScopeError, InspectionTargetNotFoundError,
)


# DB·외부 엔진에 연결하지 않고 저장 서비스만 대체합니다.
@pytest.fixture
def gui_api() -> Iterator[tuple[TestClient, AsyncMock]]:
    session = object()

    # DB 세션 의존성만 대체합니다.
    def database() -> object:
        return session

    # GUI 저장에서 외부 검사 의존성을 사용하면 즉시 실패합니다.
    def forbidden_inspector() -> None:
        pytest.fail("GUI 저장은 검색엔진 API를 호출하면 안 됩니다.")

    app.dependency_overrides[get_db] = database
    app.dependency_overrides[get_inspector] = forbidden_inspector
    try:
        with patch("app.api.inspections.save_gui_inspection", new_callable=AsyncMock) as save:
            with TestClient(app) as client:
                yield client, save
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_inspector, None)


# 저장 결과를 응답으로 반환하고 검증된 요청을 서비스에 전달합니다.
def test_gui_save_routes_validated_payload(gui_api: tuple[TestClient, AsyncMock]) -> None:
    client, save = gui_api
    target_id = uuid4()
    now = datetime.now(timezone.utc)
    save.return_value = InspectionRead(
        site_id=target_id, engine="bing", index_status="indexed",
        last_checked_at=now, next_check_at=None, error_message=None,
    )
    response = client.post(f"/sites/{target_id}/gui-inspections", json={
        "engine": "bing", "site_url": "https://example.com/",
        "target_url": "https://example.com/post", "index_status": "indexed",
        "queried_at": now.isoformat(), "observed_at": now.isoformat(),
    })

    assert response.status_code == 200
    assert response.json()["site_id"] == str(target_id)
    save.assert_awaited_once()
    assert save.call_args.args[1] == target_id
    assert save.call_args.args[2].engine == "bing"


# 잘못된 엔진별 판정은 DB 서비스에 전달하지 않습니다.
def test_gui_save_rejects_invalid_payload(gui_api: tuple[TestClient, AsyncMock]) -> None:
    client, save = gui_api
    response = client.post(f"/sites/{uuid4()}/gui-inspections", json={
        "engine": "naver", "site_url": "https://example.com/",
        "target_url": "https://example.com/post", "index_status": "not_indexed",
        "queried_at": "2026-11-08T03:00:00Z", "observed_at": "2026-11-08T03:00:02Z",
    })
    assert response.status_code == 422
    save.assert_not_awaited()


# 서비스의 대상·활성·범위 오류를 기존 검사 API와 같은 코드로 변환합니다.
@pytest.mark.parametrize("error,status,code", [
    (InspectionTargetNotFoundError("대상 없음"), 404, "TARGET_NOT_FOUND"),
    (InspectionInactiveError("비활성"), 409, "SITE_INACTIVE"),
    (InspectionScopeError("범위 오류"), 422, "INVALID_INSPECTION_SCOPE"),
])
def test_gui_save_returns_public_error(
    gui_api: tuple[TestClient, AsyncMock], error: Exception, status: int, code: str,
) -> None:
    client, save = gui_api
    save.side_effect = error
    response = client.post(f"/sites/{uuid4()}/gui-inspections", json={
        "engine": "naver", "site_url": "https://example.com/",
        "target_url": "https://example.com/post", "index_status": "unknown",
        "queried_at": "2026-11-08T03:00:00Z", "observed_at": "2026-11-08T03:00:02Z",
    })
    assert response.status_code == status
    assert response.json()["detail"]["code"] == code
