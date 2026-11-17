"""기존 글의 명시적 IndexNow 재알림 API 계약과 오류 코드를 검증합니다."""

from collections.abc import Iterator
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.pages import get_indexnow_client
from app.core.database import get_db
from app.main import app
from app.schemas.page import PageCreateResult, PageNotification, PageRead
from app.services import page as service


# 저장 서비스·IndexNow 클라이언트를 대체해 실제 DB와 검색엔진에 접근하지 않습니다.
@pytest.fixture
def notification_api() -> Iterator[tuple[TestClient, AsyncMock]]:
    # 테스트 요청에만 사용할 세션을 전달합니다.
    def database() -> object:
        return object()

    # HTTP 클라이언트 생성 없이 서비스에 전달할 객체를 제공합니다.
    def indexnow() -> object:
        return object()

    app.dependency_overrides[get_db] = database
    app.dependency_overrides[get_indexnow_client] = indexnow
    try:
        with patch("app.api.pages.service.notify_existing_page", new_callable=AsyncMock) as notify:
            with TestClient(app) as client:
                yield client, notify
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_indexnow_client, None)


# 확인한 URL을 JSON으로 전달하고 알림 상태는 저장 성공과 별개로 반환합니다.
@pytest.mark.parametrize("status", ["accepted", "key_pending", "failed", "unknown", "skipped"])
def test_existing_notification_contract(
    notification_api: tuple[TestClient, AsyncMock], status: str,
) -> None:
    client, notify = notification_api
    parent_id, page_id = uuid4(), uuid4()
    notify.return_value = PageCreateResult(
        page=PageRead(id=page_id, client_id=uuid4(), parent_site_id=parent_id, target_type="page",
                      owner_type="client", name="기존 제목", url="https://example.com/post",
                      is_active=True, created_at=datetime.now(timezone.utc)),
        submission=PageNotification(status=status),
    )
    response = client.post(f"/sites/{parent_id}/pages/{page_id}/notifications",
                           json={"expected_url": "https://example.com/post"})
    assert response.status_code == 200
    result = response.json()
    assert result["page"]["id"] == str(page_id)
    assert result["page"]["name"] == "기존 제목"
    assert result["submission"]["status"] == status
    assert result["submission"]["protocol"] == "indexnow"
    assert "key" not in result["submission"]
    notify.assert_awaited_once()
    assert notify.call_args.args[1:] == (parent_id, page_id)
    assert notify.call_args.kwargs["expected_url"] == "https://example.com/post"


# 다른 사이트·비활성·범위 오류는 중복 글 확인 모달 대상으로 오인하지 않는 고정 코드로 반환합니다.
@pytest.mark.parametrize("error,status,code", [
    (service.PageParentNotFoundError("부모 없음"), 404, "MAIN_SITE_NOT_FOUND"),
    (service.PageNotFoundError("해당 사이트의 글 없음"), 404, "PAGE_NOT_FOUND"),
    (service.PageParentInactiveError("부모 비활성"), 409, "SITE_INACTIVE"),
    (service.PageInactiveError("글 비활성"), 409, "SITE_INACTIVE"),
    (service.PageUrlScopeError("URL 범위 오류"), 422, "INVALID_PAGE_SCOPE"),
    (service.PageUrlChangedError("확인한 URL 변경"), 409, "PAGE_URL_CHANGED"),
])
def test_existing_notification_public_errors(
    notification_api: tuple[TestClient, AsyncMock], error: Exception, status: int, code: str,
) -> None:
    client, notify = notification_api
    notify.side_effect = error
    response = client.post(f"/sites/{uuid4()}/pages/{uuid4()}/notifications",
                           json={"expected_url": "https://example.com/post"})
    assert response.status_code == status
    assert response.json()["detail"]["code"] == code
    notify.assert_awaited_once()


# UUID 검증에 실패한 요청은 재알림 서비스에 전달하지 않습니다.
@pytest.mark.parametrize("parent,page", [("invalid", str(uuid4())), (str(uuid4()), "invalid")])
def test_existing_notification_invalid_ids(
    notification_api: tuple[TestClient, AsyncMock], parent: str, page: str,
) -> None:
    client, notify = notification_api
    assert client.post(f"/sites/{parent}/pages/{page}/notifications",
                       json={"expected_url": "https://example.com/post"}).status_code == 422
    notify.assert_not_awaited()


# 기존 생성 API는 중복 저장을 계속 409로 반환하며 재알림을 자동 실행하지 않습니다.
def test_create_duplicate_contract_unchanged(notification_api: tuple[TestClient, AsyncMock]) -> None:
    client, notify = notification_api
    with patch("app.api.pages.service.create_page", new_callable=AsyncMock,
               side_effect=service.DuplicatePageError("이미 등록된 URL")):
        response = client.post(f"/sites/{uuid4()}/pages", json={
            "name": "중복 입력 제목", "url": "https://example.com/post", "notify_search_engines": True,
        })
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "DUPLICATE_PAGE"
    notify.assert_not_awaited()


# 일반 HTML 폼·텍스트와 본문 없는 요청은 재알림 부작용을 만들지 않습니다.
@pytest.mark.parametrize("headers,body", [
    ({}, None),
    ({"Content-Type": "application/x-www-form-urlencoded"}, "expected_url=https://example.com/post"),
    ({"Content-Type": "text/plain"}, '{"expected_url":"https://example.com/post"}'),
    ({"Content-Type": "multipart/form-data; boundary=example"}, "--example--"),
])
def test_existing_notification_rejects_non_json(
    notification_api: tuple[TestClient, AsyncMock], headers: dict[str, str], body: str | None,
) -> None:
    client, notify = notification_api
    response = client.post(f"/sites/{uuid4()}/pages/{uuid4()}/notifications", headers=headers, content=body)
    assert response.status_code == 415
    assert response.json()["detail"]["code"] == "JSON_REQUIRED"
    notify.assert_not_awaited()


# JSON이라도 URL 누락·잘못된 URL·추가 필드는 서비스 실행 전에 거부합니다.
@pytest.mark.parametrize("payload", [
    {}, {"expected_url": "not-a-url"},
    {"expected_url": "https://user:secret@example.com/post"},
    {"expected_url": "https://example.com/post", "unexpected": True},
])
def test_existing_notification_requires_url(
    notification_api: tuple[TestClient, AsyncMock], payload: dict[str, object],
) -> None:
    client, notify = notification_api
    assert client.post(f"/sites/{uuid4()}/pages/{uuid4()}/notifications", json=payload).status_code == 422
    notify.assert_not_awaited()


# JSON Content-Type만 지정하고 본문이 없을 때도 기존 글 알림은 실행하지 않습니다.
def test_existing_notification_requires_json_body(notification_api: tuple[TestClient, AsyncMock]) -> None:
    client, notify = notification_api
    response = client.post(f"/sites/{uuid4()}/pages/{uuid4()}/notifications",
                           headers={"Content-Type": "application/json; charset=utf-8"})
    assert response.status_code == 422
    notify.assert_not_awaited()


# 문자 인코딩이 명시된 정상 JSON과 URL 정규화를 지원합니다.
def test_existing_notification_accepts_json_charset(notification_api: tuple[TestClient, AsyncMock]) -> None:
    client, notify = notification_api
    parent_id, page_id = uuid4(), uuid4()
    notify.return_value = PageCreateResult(
        page=PageRead(id=page_id, client_id=uuid4(), parent_site_id=parent_id, target_type="page",
                      owner_type="client", name="기존 글", url="https://example.com/post",
                      is_active=True, created_at=datetime.now(timezone.utc)),
        submission=PageNotification(status="accepted"),
    )
    response = client.post(f"/sites/{parent_id}/pages/{page_id}/notifications",
                           headers={"Content-Type": "application/json; charset=utf-8"},
                           json={"expected_url": "HTTPS://EXAMPLE.COM/post"})
    assert response.status_code == 200
    assert notify.call_args.kwargs["expected_url"] == "https://example.com/post"
