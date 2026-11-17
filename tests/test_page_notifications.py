"""기존 글의 재알림이 저장 변경 없이 검증 후 한 번만 전송되는지 확인합니다."""

from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.engines.indexnow.client import IndexNowTimeoutError, IndexNowTransportError
from app.engines.indexnow.schemas import IndexNowRequest, IndexNowResult
from app.models.site import Site
from app.schemas.page import PageNotification
from app.services import page as service

pytestmark = pytest.mark.anyio


# 네트워크나 DB 없이 asyncio만 사용합니다.
@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


# DB 조회 트랜잭션이 외부 전송 전에 종료되는지 관찰합니다.
class NotificationSession:
    # 각 검증 단계가 반환할 부모·글과 설정을 준비합니다.
    def __init__(self, parent: Site | None, page: Site | None) -> None:
        self.active = False
        self.scalar = AsyncMock(side_effect=[parent, page])

    # 읽기 트랜잭션의 열림·닫힘을 재현합니다.
    @asynccontextmanager
    async def begin(self) -> AsyncIterator[None]:
        self.active = True
        try:
            yield
        finally:
            self.active = False


# 고정된 관계의 기존 메인 사이트와 글을 만듭니다.
def stored_pages() -> tuple[Site, Site]:
    client_id, parent_id = uuid4(), uuid4()
    parent = Site(id=parent_id, client_id=client_id, target_type="site", owner_type="client",
                  name="기존 사이트", url="https://example.com/blog/", is_active=True)
    page = Site(id=uuid4(), client_id=client_id, parent_site_id=parent_id, target_type="page",
                owner_type="client", name="기존 제목", url="https://example.com/blog/post",
                is_active=True, created_at=datetime.now(timezone.utc))
    return parent, page


# 성공·키 확인 중·거절은 모두 기존 글과 실제 IndexNow 접수 상태로 반환합니다.
@pytest.mark.parametrize("http_status,status", [(200, "accepted"), (202, "key_pending"), (429, "failed")])
async def test_notify_existing_once_after_transaction(http_status: int, status: str) -> None:
    parent, page = stored_pages()
    session = NotificationSession(parent, page)
    notification = IndexNowRequest(host="example.com", key="a1b2c3d4", urls=(page.url,))

    # 외부 호출에 DB 트랜잭션이 남아 있거나 수정 정보가 전달되면 실패합니다.
    async def send(request: IndexNowRequest, *, client: object) -> IndexNowResult:
        assert not session.active
        assert request.urls == (page.url,)
        return IndexNowResult(http_status=http_status, requested_at=datetime.now(timezone.utc))

    with patch.object(service, "_prepare_notification", AsyncMock(return_value=notification)) as prepare:
        with patch.object(service, "notify_published_urls", AsyncMock(side_effect=send)) as notify:
            result = await service.notify_existing_page(session, parent.id, page.id, expected_url=page.url, client=object())

    prepare.assert_awaited_once_with(session, parent.id, page.url)
    notify.assert_awaited_once()
    assert result.page.id == page.id
    assert result.page.name == "기존 제목"
    assert result.submission.status == status
    assert result.submission.error_code == ("INDEXNOW_REJECTED" if status == "failed" else None)
    assert session.scalar.await_count == 2
    assert not hasattr(session, "add")


# 설정이 없으면 접수 성공을 만들거나 외부로 전송하지 않습니다.
async def test_notify_existing_missing_settings_skips_network() -> None:
    parent, page = stored_pages()
    session = NotificationSession(parent, page)
    with patch.object(service, "_prepare_notification", AsyncMock(return_value=PageNotification(
        status="skipped", error_code="INDEXNOW_NOT_CONFIGURED",
    ))):
        with patch.object(service, "notify_published_urls", AsyncMock()) as notify:
            result = await service.notify_existing_page(session, parent.id, page.id, expected_url=page.url, client=object())
    notify.assert_not_awaited()
    assert result.submission.status == "skipped"
    assert result.submission.error_code == "INDEXNOW_NOT_CONFIGURED"


# 전송 후 통신 오류는 재시도하지 않고 접수 여부 미확인으로 반환합니다.
@pytest.mark.parametrize("error,code", [
    (IndexNowTimeoutError("고정된 안내"), "INDEXNOW_TIMEOUT"),
    (IndexNowTransportError("고정된 안내"), "INDEXNOW_TRANSPORT_ERROR"),
])
async def test_notify_existing_transport_unknown(error: Exception, code: str) -> None:
    parent, page = stored_pages()
    session = NotificationSession(parent, page)
    notification = IndexNowRequest(host="example.com", key="a1b2c3d4", urls=(page.url,))
    with patch.object(service, "_prepare_notification", AsyncMock(return_value=notification)):
        with patch.object(service, "notify_published_urls", AsyncMock(side_effect=error)) as notify:
            result = await service.notify_existing_page(session, parent.id, page.id, expected_url=page.url, client=object())
    notify.assert_awaited_once()
    assert result.page.id == page.id
    assert result.submission.status == "unknown"
    assert result.submission.error_code == code


# 존재하지 않는 메인 사이트·글은 설정 조회와 외부 전송 전에 거부합니다.
@pytest.mark.parametrize("missing", ["parent", "page"])
async def test_notify_existing_missing_scope(missing: str) -> None:
    parent, page = stored_pages()
    session = NotificationSession(None if missing == "parent" else parent, None if missing == "page" else page)
    with patch.object(service, "_prepare_notification", AsyncMock()) as prepare:
        with patch.object(service, "notify_published_urls", AsyncMock()) as notify:
            with pytest.raises(service.PageParentNotFoundError if missing == "parent" else service.PageNotFoundError):
                await service.notify_existing_page(session, parent.id, page.id, expected_url=page.url, client=object())
    prepare.assert_not_awaited()
    notify.assert_not_awaited()


# 비활성 부모와 글은 중복 URL 오류와 구분해 전송을 막습니다.
@pytest.mark.parametrize("inactive", ["parent", "page"])
async def test_notify_existing_inactive(inactive: str) -> None:
    parent, page = stored_pages()
    setattr(parent if inactive == "parent" else page, "is_active", False)
    session = NotificationSession(parent, page)
    with patch.object(service, "notify_published_urls", AsyncMock()) as notify:
        with pytest.raises(service.PageParentInactiveError if inactive == "parent" else service.PageInactiveError):
            await service.notify_existing_page(session, parent.id, page.id, expected_url=page.url, client=object())
    notify.assert_not_awaited()


# 조회에 반환된 글의 부모·고객사·대상 유형도 다시 검증합니다.
@pytest.mark.parametrize("changes", [
    {"parent_site_id": uuid4()}, {"client_id": uuid4()}, {"target_type": "site"},
])
async def test_notify_existing_rejects_mismatched_stored_page(changes: dict[str, object]) -> None:
    parent, page = stored_pages()
    for name, value in changes.items():
        setattr(page, name, value)
    session = NotificationSession(parent, page)
    with patch.object(service, "notify_published_urls", AsyncMock()) as notify:
        with pytest.raises(service.PageNotFoundError):
            await service.notify_existing_page(session, parent.id, page.id, expected_url=page.url, client=object())
    notify.assert_not_awaited()


# 저장된 URL이 부모 범위를 벗어나도 외부 알림을 실행하지 않습니다.
async def test_notify_existing_invalid_url_scope() -> None:
    parent, page = stored_pages()
    page.url = "https://other.example/post"
    session = NotificationSession(parent, page)
    with patch.object(service, "notify_published_urls", AsyncMock()) as notify:
        with pytest.raises(service.PageUrlScopeError):
            await service.notify_existing_page(session, parent.id, page.id, expected_url=page.url, client=object())
    notify.assert_not_awaited()


# 확인 모달 이후 같은 글의 URL이 바뀌면 새 URL을 임의로 알리지 않습니다.
async def test_notify_existing_rejects_changed_url_before_settings() -> None:
    parent, page = stored_pages()
    session = NotificationSession(parent, page)
    with patch.object(service, "_prepare_notification", AsyncMock()) as prepare:
        with patch.object(service, "notify_published_urls", AsyncMock()) as notify:
            with pytest.raises(service.PageUrlChangedError):
                await service.notify_existing_page(session, parent.id, page.id,
                                                   expected_url="https://example.com/blog/previous",
                                                   client=object())
    prepare.assert_not_awaited()
    notify.assert_not_awaited()
