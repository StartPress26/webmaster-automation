"""글 등록의 필수 입력·서버 지정 필드·URL 검증을 확인합니다."""

import pytest
from pydantic import ValidationError

from app.schemas.page import PageCreate


# 제목과 URL을 정리하고 알림 기본값을 활성화합니다.
def test_page_defaults() -> None:
    page = PageCreate(name=" 새 글 ", url="https://EXAMPLE.COM/post?lang=ko")
    assert page.name == "새 글"
    assert page.url == "https://example.com/post?lang=ko"
    assert page.notify_search_engines is True


# 빈 제목·잘못된 URL·서버 지정 필드와 느슨한 boolean 입력을 차단합니다.
@pytest.mark.parametrize("changes", [
    {"name": " "}, {"url": "ftp://example.com/post"},
    {"url": "https://example.com/post#fragment"}, {"url": "https://user:password@example.com/post"},
    {"url": "https://example.com/blog/../other"}, {"url": "https://example.com/" + "가" * 700},
    {"url": 123}, {"notify_search_engines": "false"}, {"notify_search_engines": None},
    {"client_id": "사용자 지정"}, {"owner_type": "internal"}, {"parent_site_id": None},
    {"target_type": "site"}, {"is_active": False},
])
def test_invalid_page(changes: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        PageCreate.model_validate({"name": "글", "url": "https://example.com/post"} | changes)
