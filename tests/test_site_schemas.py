"""메인 사이트 입력 검증과 DB 객체의 응답 변환을 확인합니다."""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.site import Site
from app.schemas.site import SiteCreate, SiteList, SiteRead


# 필수 입력에 원하는 변경값을 합쳐 등록 요청을 만듭니다.
def make_request(**changes: object) -> SiteCreate:
    return SiteCreate.model_validate({
        "client_id": str(uuid4()),
        "name": "유담 블로그",
        "url": "https://example.com/blog/",
        "owner_type": "client",
    } | changes)


# 이름 공백 제거와 선택 입력의 기본값을 확인합니다.
def test_site_create_defaults_and_name() -> None:
    request = make_request(name="  유담 블로그  ")

    assert request.name == "유담 블로그"
    assert request.cms_type is None
    assert request.can_edit_site is None
    assert request.indexnow_key is None
    assert request.indexnow_key_location is None
    assert "target_type" not in request.model_dump()
    assert "parent_site_id" not in request.model_dump()


# 설치 가능·불가능·모름의 세 값을 구분합니다.
@pytest.mark.parametrize("value", [True, False, None])
def test_can_edit_site_preserves_three_states(value: bool | None) -> None:
    assert make_request(can_edit_site=value).can_edit_site is value


# 잘못된 필드와 서버가 결정할 필드의 입력을 거부합니다.
@pytest.mark.parametrize("changes", [
    {"name": " \t "}, {"client_id": "invalid"}, {"owner_type": "other"},
    {"can_edit_site": "false"}, {"can_edit_site": 1},
    {"target_type": "site"}, {"parent_site_id": None}, {"is_active": False},
])
def test_invalid_site_fields_are_rejected(changes: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        make_request(**changes)


# 주소의 호스트를 정규화하면서 경로와 쿼리 및 끝 슬래시는 유지합니다.
@pytest.mark.parametrize(("source", "expected"), [
    (" HTTPS://EXAMPLE.COM/blog/ ", "https://example.com/blog/"),
    ("http://example.com/blog", "http://example.com/blog"),
    ("https://example.com/blog/?lang=ko", "https://example.com/blog/?lang=ko"),
    ("https://example.com", "https://example.com/"),
])
def test_valid_url_normalization(source: str, expected: str) -> None:
    request = make_request(url=source)
    assert request.url == expected
    assert isinstance(request.model_dump()["url"], str)


# 잘못된 주소와 인증정보·프래그먼트가 포함된 주소를 거부합니다.
@pytest.mark.parametrize("url", [
    "", "example.com", "ftp://example.com/", "https://", "https:///example.com",
    "https:example.com", "https://exa mple.com", "https://example.com/a\nb",
    "https://example.com\\blog", "https://user:password@example.com/",
    "https://example.com/blog/#section", "https://example.com:99999/",
])
def test_invalid_urls_are_rejected(url: str) -> None:
    with pytest.raises(ValidationError):
        make_request(url=url)


# DB와 같은 UTF-8 바이트 기준으로 길이 경계를 확인합니다.
def test_url_byte_limit_after_normalization() -> None:
    prefix = "https://example.com/"
    at_limit = prefix + "a" * (2048 - len(prefix))

    assert len(make_request(url=at_limit).url.encode("utf-8")) == 2048

    with pytest.raises(ValidationError):
        make_request(url=at_limit + "a")

    # 한글 경로는 URL 인코딩 후 길이가 늘어나므로 변환한 주소를 기준으로 검사합니다.
    with pytest.raises(ValidationError):
        make_request(url=prefix + "가" * 300)


# SQLAlchemy 객체를 메인 사이트 응답과 JSON 목록으로 변환합니다.
def test_site_read_from_orm_and_list_serialization() -> None:
    row = Site(
        id=uuid4(), client_id=uuid4(), parent_site_id=None, target_type="site",
        name="유담 블로그", url="https://example.com/blog/", owner_type="client",
        cms_type="custom", can_edit_site=None, is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    site = SiteRead.model_validate(row)
    payload = SiteList(items=(site,)).model_dump(mode="json")

    assert payload["items"][0]["id"] == str(row.id)
    assert payload["items"][0]["target_type"] == "site"
    assert payload["items"][0]["parent_site_id"] is None
    assert SiteList(items=()).model_dump(mode="json") == {"items": []}


# 키 설정은 두 값을 함께 받고 호스트와 디렉터리 적용 범위를 검사합니다.
@pytest.mark.parametrize("changes", [
    {"indexnow_key": "a1b2c3d4"},
    {"indexnow_key_location": "https://example.com/key.txt"},
    {"indexnow_key": "bad", "indexnow_key_location": "https://example.com/key.txt"},
    {"indexnow_key": "a1b2c3d4", "indexnow_key_location": "https://other.test/key.txt"},
    {"indexnow_key": "a1b2c3d4", "indexnow_key_location": "https://example.com/other/key.txt"},
    {"indexnow_key": "a1b2c3d4", "indexnow_key_location": "https://example.com/key.txt#fragment"},
])
def test_invalid_indexnow_settings(changes: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        make_request(**changes)


# 루트와 블로그 폴더의 정상 키 파일 주소를 받고 키를 객체 출력에서 숨깁니다.
@pytest.mark.parametrize("location", ["https://example.com/key.txt", "https://example.com/blog/key.txt"])
def test_valid_indexnow_settings(location: str) -> None:
    request = make_request(indexnow_key="a1b2c3d4", indexnow_key_location=location)
    assert request.indexnow_key == "a1b2c3d4"
    assert request.indexnow_key_location == location
    assert "a1b2c3d4" not in repr(request)
