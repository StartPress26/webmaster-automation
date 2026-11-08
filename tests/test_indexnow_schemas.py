"""IndexNow의 잘못된 대상 제출과 키 적용 범위 이탈을 검사합니다."""

from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.engines.indexnow.schemas import IndexNowRequest, IndexNowResult, SubmissionStatus

REQUEST = IndexNowRequest(
    host="example.com", key="a1b2c3d4e5f67890", urls=("https://example.com/",)
)


# 검증을 생략하는 model_copy 대신 변경한 입력으로 모델을 새로 생성합니다.
def _request(**updates: object) -> IndexNowRequest:
    return IndexNowRequest.model_validate(REQUEST.model_dump() | updates)


# 원본을 보존하면서 중복 URL만 제거하고, HTTP·HTTPS 혼합을 허용합니다.
def test_validation_returns_deduplicated_copy() -> None:
    urls = ("https://example.com/", "http://example.com/post", "https://example.com/")
    request = _request(urls=urls)

    assert request.urls == urls[:2]
    assert len(urls) == 3

    with pytest.raises(ValidationError, match="frozen_instance"):
        request.host = "other.test"


# 스킴·경로·인증정보 등이 host에 섞여 들어오는 요청을 거부합니다.
@pytest.mark.parametrize(
    "host",
    [
        "",
        "https://example.com",
        "example.com/",
        "example.com:80",
        "user@example.com",
        "-example.com",
        "example..com",
    ],
)
def test_invalid_host_is_rejected(host: str) -> None:
    with pytest.raises(ValueError, match="host"):
        _request(host=host)


# 네이버에 제출할 수 없는 키를 거부하며 키 값을 오류에 출력하지 않습니다.
@pytest.mark.parametrize(
    "key",
    [
        "a" * 7,
        "a" * 129,
        "invalid-key",
        "abcd_1234",
        "abcd 1234",
    ],
)
def test_invalid_key_is_rejected(key: str) -> None:
    with pytest.raises(ValueError, match="key") as error:
        _request(key=key)
    assert key not in str(error.value)


# 호스트는 대소문자 차이를 허용하되 www와 하위 도메인은 구분합니다.
@pytest.mark.parametrize(
    "url",
    [
        "https://www.example.com/",
        "https://sub.example.com/",
        "https://example.com.evil.test/",
        "https://example.com@evil.test/",
    ],
)
def test_other_hosts_are_rejected(url: str) -> None:
    with pytest.raises(ValueError):
        _request(urls=(url,))


# HTTP 파서의 보정이나 인코딩으로 모호해지는 주소를 거부합니다.
@pytest.mark.parametrize(
    "url",
    [
        "ftp://example.com/",
        "https:///example.com/",
        "https://example.com/a b",
        "https://example.com/\n",
        "https://user:password@example.com/",
        "https://example.com/#",
        "https://example.com/\\post",
        "https://example.com/%xx",
        "https://example.com/blog/../private",
        "https://example.com/blog/%2e%2e/private",
        "https://example.com/blog/%252e%252e/private",
    ],
)
def test_invalid_urls_are_rejected(url: str) -> None:
    with pytest.raises(ValueError):
        _request(urls=(url,))


# 키 파일이 하위 경로에 있을 때 정상 하위 글과 쿼리·인코딩 경로를 허용합니다.
def test_key_directory_allows_descendants() -> None:
    request = _request(
        host="EXAMPLE.COM", key_location="https://example.com/blog/key.txt",
        urls=("https://example.com/blog/post?q=1", "https://example.com/blog/%ED%95%9C%EA%B8%80"),
    )

    assert len(request.urls) == 2


# 접두사만 비슷한 디렉터리와 상위 경로로의 이탈을 거부합니다.
@pytest.mark.parametrize(
    "path",
    [
        "/",
        "/blog",
        "/blogger/post",
        "/other/post",
        "/blog/%2e%2e/private",
    ],
)
def test_outside_key_directory_is_rejected(path: str) -> None:
    with pytest.raises(ValidationError):
        _request(
            key_location="https://example.com/blog/key.txt",
            urls=(f"https://example.com{path}",),
        )


# 다른 호스트나 디렉터리 주소를 키 파일로 지정하지 못하게 합니다.
@pytest.mark.parametrize(
    "location",
    [
        "https://other.test/key.txt",
        "https://example.com/",
        "https://example.com",
        "https://example.com/key.txt?key=1",
        "https://example.com/key.txt#fragment",
    ],
)
def test_invalid_key_location_is_rejected(location: str) -> None:
    with pytest.raises(ValueError):
        _request(key_location=location)


# 요청 크기는 중복 제거 전 원본 개수를 기준으로 제한합니다.
@pytest.mark.parametrize(
    "count",
    [
        0,
        10_001,
    ],
)
def test_url_count_limits(count: int) -> None:
    with pytest.raises(ValueError, match="urls"):
        _request(urls=REQUEST.urls * count)


# 최대 허용 개수까지 검증하며, 원본 요청의 불변성을 유지합니다.
def test_maximum_batch_is_allowed() -> None:
    request = _request(urls=REQUEST.urls * 10_000)
    assert request.urls == REQUEST.urls


# HTTP 접수 상태를 직렬화하되 색인 완료 상태로 해석하지 않습니다.
@pytest.mark.parametrize(
    "http_status, expected",
    [
        (200, "accepted"),
        (202, "key_pending"),
        (403, "failed"),
        (429, "failed"),
        (500, "failed"),
    ],
)
def test_result_status(http_status: int, expected: SubmissionStatus) -> None:
    result = IndexNowResult(http_status=http_status, requested_at=datetime.now(timezone.utc))
    assert result.status == expected
    assert result.model_dump()["status"] == expected


# 관측 시각의 시간대 누락과 잘못된 필드 타입을 거부합니다.
def test_invalid_result_is_rejected() -> None:
    with pytest.raises(ValidationError):
        IndexNowResult(http_status=200, requested_at=datetime(2026, 10, 27))
    with pytest.raises(ValidationError):
        IndexNowResult(http_status="200", requested_at=datetime.now(timezone.utc))


# 생성 시 잘못된 타입과 알 수 없는 필드를 거부하고 키를 repr에 노출하지 않습니다.
def test_schema_types_and_extra_fields() -> None:
    with pytest.raises(ValidationError):
        _request(host=123)

    with pytest.raises(ValidationError):
        _request(key=12345678)

    with pytest.raises(ValidationError):
        _request(unexpected=True)

    assert REQUEST.key not in repr(REQUEST)
