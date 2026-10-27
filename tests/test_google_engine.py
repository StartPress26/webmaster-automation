"""실제 Google 요청 없이 사이트 조회와 오류 분류를 확인합니다."""

from collections.abc import Iterator
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
from google.auth.exceptions import RefreshError
from google.oauth2.credentials import Credentials
from requests.exceptions import ConnectionError, Timeout

from app.engines.google.google import (
    GoogleEngine, GoogleEngineError, GoogleOwnership, GoogleSite, GoogleVerificationFile,
)

SITE_URL = "https://example.com/blog/"


# 인증된 세션을 모의 객체로 바꿔 실제 네트워크 호출을 차단합니다.
@pytest.fixture
def session(monkeypatch: pytest.MonkeyPatch) -> Iterator[MagicMock]:
    mocked = MagicMock()
    mocked.get.return_value.status_code = 200
    mocked.get.return_value.json.return_value = {
        "siteUrl": SITE_URL, "permissionLevel": "siteOwner"
    }
    factory = MagicMock(return_value=mocked)
    monkeypatch.setattr("app.engines.google.google.AuthorizedSession", factory)
    yield mocked


# 정확한 속성 주소를 경로 전체 인코딩하고 권한 정보를 반환합니다.
def test_get_site(session: MagicMock) -> None:
    with GoogleEngine(Credentials(token="test")) as engine:
        assert engine.get_site(SITE_URL) == GoogleSite(SITE_URL, "siteOwner")
    session.get.assert_called_once_with(
        "https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fexample.com%2Fblog%2F",
        timeout=30, allow_redirects=False,
    )
    session.close.assert_called_once()


# 도메인 속성도 주소를 바꾸지 않고 조회합니다.
def test_domain_property(session: MagicMock) -> None:
    session.get.return_value.json.return_value = {
        "siteUrl": "sc-domain:example.com", "permissionLevel": "siteFullUser"
    }
    with GoogleEngine(Credentials(token="test")) as engine:
        assert engine.get_site("sc-domain:example.com") == GoogleSite(
            "sc-domain:example.com", "siteFullUser"
        )


# 404는 현재 계정에서 속성을 찾지 못한 결과로 반환합니다.
def test_missing_site(session: MagicMock) -> None:
    session.get.return_value.status_code = 404
    with GoogleEngine(Credentials(token="test")) as engine:
        assert engine.get_site(SITE_URL) is None
    session.get.return_value.json.assert_not_called()


# HTTP 오류를 구분하고 응답 본문에 포함된 비밀값은 전달하지 않습니다.
@pytest.mark.parametrize("status, code", [
    (401, "authentication"), (403, "permission"), (429, "rate_limit"),
    (500, "response"), (302, "response"),
])
def test_http_errors(session: MagicMock, status: int, code: str) -> None:
    session.get.return_value.status_code = status
    session.get.return_value.json.return_value = {"error": {"message": "test-secret"}}
    with GoogleEngine(Credentials(token="test")) as engine:
        with pytest.raises(GoogleEngineError) as caught:
            engine.get_site(SITE_URL)
    assert caught.value.code == code
    assert caught.value.status_code == status
    assert "test-secret" not in str(caught.value)
    session.close.assert_called_once()


# Google의 403 호출 제한도 일반 권한 오류와 구분합니다.
def test_403_quota_error(session: MagicMock) -> None:
    session.get.return_value.status_code = 403
    session.get.return_value.json.return_value = {
        "error": {"errors": [{"reason": "userRateLimitExceeded"}]}
    }
    with GoogleEngine(Credentials(token="test")) as engine:
        with pytest.raises(GoogleEngineError) as caught:
            engine.get_site(SITE_URL)
    assert caught.value.code == "rate_limit"


# 통신 및 인증 갱신 예외를 안전한 오류로 변환합니다.
@pytest.mark.parametrize("error, code", [
    (Timeout("test-secret"), "timeout"),
    (ConnectionError("test-secret"), "connection"),
    (RefreshError("test-secret"), "authentication"),
])
def test_request_errors(session: MagicMock, error: Exception, code: str) -> None:
    session.get.side_effect = error
    with GoogleEngine(Credentials(token="test")) as engine:
        with pytest.raises(GoogleEngineError) as caught:
            engine.get_site(SITE_URL)
    assert caught.value.code == code
    assert "test-secret" not in str(caught.value)
    assert caught.value.__suppress_context__
    session.close.assert_called_once()


# 잘못된 응답을 정상 등록 정보로 오인하지 않습니다.
@pytest.mark.parametrize("data", [
    None, [], {}, {"siteUrl": SITE_URL},
    {"siteUrl": "https://other.example/", "permissionLevel": "siteOwner"},
    {"siteUrl": SITE_URL, "permissionLevel": "unexpected"},
    {"siteUrl": SITE_URL, "permissionLevel": []},
])
def test_invalid_response(session: MagicMock, data: object) -> None:
    session.get.return_value.json.return_value = data
    with GoogleEngine(Credentials(token="test")) as engine:
        with pytest.raises(GoogleEngineError) as caught:
            engine.get_site(SITE_URL)
    assert caught.value.code == "response"


# JSON 파싱 오류도 응답 원문을 노출하지 않습니다.
def test_invalid_json(session: MagicMock) -> None:
    session.get.return_value.json.side_effect = ValueError("test-secret")
    with GoogleEngine(Credentials(token="test")) as engine:
        with pytest.raises(GoogleEngineError) as caught:
            engine.get_site(SITE_URL)
    assert caught.value.code == "response"
    assert "test-secret" not in str(caught.value)


# 빈 주소나 공백이 있는 주소는 요청 전에 거부합니다.
@pytest.mark.parametrize("site_url", ["", " https://example.com/", "https://example.com/\n"])
def test_invalid_input(session: MagicMock, site_url: str) -> None:
    with GoogleEngine(Credentials(token="test")) as engine:
        with pytest.raises(ValueError):
            engine.get_site(site_url)
    session.get.assert_not_called()


# 손상된 403 응답도 원본 예외 없이 권한 오류로 반환합니다.
@pytest.mark.parametrize("data", [None, [], {"error": {"errors": None}}])
def test_malformed_permission_error(session: MagicMock, data: object) -> None:
    session.get.return_value.status_code = 403
    session.get.return_value.json.return_value = data
    with GoogleEngine(Credentials(token="test")) as engine:
        with pytest.raises(GoogleEngineError) as caught:
            engine.get_site(SITE_URL)
    assert caught.value.code == "permission"


# 사이트 등록의 빈 성공 응답을 처리하며 소유 확인을 자동으로 실행하지 않습니다.
@pytest.mark.parametrize("status", [200, 204])
def test_register_site(session: MagicMock, status: int) -> None:
    session.put.return_value.status_code = status
    with GoogleEngine(Credentials(token="test")) as engine:
        assert engine.register_site(SITE_URL) is True
    session.put.assert_called_once_with(
        "https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fexample.com%2Fblog%2F",
        timeout=30, allow_redirects=False,
    )
    session.put.return_value.json.assert_not_called()
    session.post.assert_not_called()


# 인증 파일은 사이트 경로 아래에 배포할 수 있는 정보만 반환합니다.
def test_get_verification_token(session: MagicMock) -> None:
    session.post.return_value.status_code = 200
    session.post.return_value.json.return_value = {"method": "FILE", "token": "google123.html"}
    with GoogleEngine(Credentials(token="test")) as engine:
        assert engine.get_verification_token(SITE_URL) == GoogleVerificationFile(
            file_name="google123.html",
            file_content="google-site-verification: google123.html",
            verification_url="https://example.com/blog/google123.html",
        )
    session.post.assert_called_once_with(
        "https://www.googleapis.com/siteVerification/v1/token",
        json={"site": {"type": "SITE", "identifier": SITE_URL}, "verificationMethod": "FILE"},
        timeout=30, allow_redirects=False,
    )


# 사람이 배포를 마친 뒤 소유 확인을 요청하며 다른 소유자의 이메일은 반환하지 않습니다.
def test_verify_ownership(session: MagicMock) -> None:
    session.post.return_value.status_code = 200
    session.post.return_value.json.return_value = {
        "id": "test-resource", "site": {"type": "SITE", "identifier": SITE_URL},
        "owners": ["private@example.com"],
    }
    with GoogleEngine(Credentials(token="test")) as engine:
        result = engine.verify_ownership(SITE_URL)
    assert result == GoogleOwnership(SITE_URL, "test-resource")
    assert "private@example.com" not in repr(result)
    session.post.assert_called_once_with(
        "https://www.googleapis.com/siteVerification/v1/webResource",
        params={"verificationMethod": "FILE"},
        json={"site": {"type": "SITE", "identifier": SITE_URL}},
        timeout=30, allow_redirects=False,
    )


# 사이트맵 주소의 쿼리까지 경로 인코딩하고 빈 접수 응답을 처리합니다.
def test_submit_sitemap(session: MagicMock) -> None:
    session.put.return_value.status_code = 204
    with GoogleEngine(Credentials(token="test")) as engine:
        assert engine.submit_sitemap(SITE_URL, "https://example.com/sitemap.xml?v=1&lang=ko")
    session.put.assert_called_once_with(
        "https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fexample.com%2Fblog%2F"
        "/sitemaps/https%3A%2F%2Fexample.com%2Fsitemap.xml%3Fv%3D1%26lang%3Dko",
        timeout=30, allow_redirects=False,
    )
    session.put.return_value.json.assert_not_called()


# 인증 파일 설치 전의 실패를 성공으로 반환하거나 원문을 노출하지 않습니다.
def test_verification_failure(session: MagicMock) -> None:
    session.post.return_value.status_code = 400
    session.post.return_value.json.return_value = {"error": {"message": "test-secret"}}
    with GoogleEngine(Credentials(token="test")) as engine:
        with pytest.raises(GoogleEngineError) as caught:
            engine.verify_ownership(SITE_URL)
    assert caught.value.status_code == 400
    assert "test-secret" not in str(caught.value)
    session.put.assert_not_called()


# 파일명으로 사용할 수 없는 값이나 다른 인증 방식의 응답은 거부합니다.
@pytest.mark.parametrize("data", [
    {}, {"method": "META", "token": "google123.html"},
    {"method": "FILE", "token": "../google123.html"},
    {"method": "FILE", "token": "https://other.example/google123.html"},
    {"method": "FILE", "token": []},
])
def test_invalid_verification_file(session: MagicMock, data: object) -> None:
    session.post.return_value.status_code = 200
    session.post.return_value.json.return_value = data
    with GoogleEngine(Credentials(token="test")) as engine:
        with pytest.raises(GoogleEngineError):
            engine.get_verification_token(SITE_URL)


# 다른 사이트의 응답이나 불완전한 응답을 소유 확인 성공으로 처리하지 않습니다.
@pytest.mark.parametrize("data", [
    {}, {"id": "test", "site": []},
    {"id": "test", "site": {"type": "SITE", "identifier": "https://other.example/"}},
    {"id": "", "site": {"type": "SITE", "identifier": SITE_URL}},
])
def test_invalid_ownership_response(session: MagicMock, data: object) -> None:
    session.post.return_value.status_code = 200
    session.post.return_value.json.return_value = data
    with GoogleEngine(Credentials(token="test")) as engine:
        with pytest.raises(GoogleEngineError):
            engine.verify_ownership(SITE_URL)


# FILE 인증은 URL-prefix만 지원하며 잘못된 주소는 Google 호출 전에 거부합니다.
@pytest.mark.parametrize("site_url", [
    "sc-domain:example.com", "https://example.com/blog", "https://example.com/?q=1",
    "https://example.com/#x", "https://user:pass@example.com/", "file:///tmp/",
])
@pytest.mark.parametrize("method", ["get_verification_token", "verify_ownership"])
def test_invalid_file_site(session: MagicMock, site_url: str, method: str) -> None:
    with GoogleEngine(Credentials(token="test")) as engine:
        with pytest.raises(ValueError):
            getattr(engine, method)(site_url)
    session.post.assert_not_called()


# 모든 변경 메서드는 공통 HTTP 오류 처리를 거쳐 실패를 전달합니다.
@pytest.mark.parametrize("method, args, verb", [
    ("register_site", (SITE_URL,), "put"),
    ("get_verification_token", (SITE_URL,), "post"),
    ("verify_ownership", (SITE_URL,), "post"),
    ("submit_sitemap", (SITE_URL, "https://example.com/sitemap.xml"), "put"),
])
@pytest.mark.parametrize("status, code", [(403, "permission"), (429, "rate_limit"), (500, "response")])
def test_write_errors(
    session: MagicMock, method: str, args: tuple[str, ...], verb: str, status: int, code: str,
) -> None:
    response = getattr(session, verb).return_value
    response.status_code = status
    response.json.return_value = {"error": {"message": "test-secret"}}
    with GoogleEngine(Credentials(token="test")) as engine:
        with pytest.raises(GoogleEngineError) as caught:
            getattr(engine, method)(*args)
    assert caught.value.code == code
    assert "test-secret" not in str(caught.value)


# 사이트맵은 HTTP 주소만 허용하며 인증정보나 프래그먼트가 있는 주소는 거부합니다.
@pytest.mark.parametrize("url", ["file:///tmp/sitemap.xml", "https://a:b@example.com/map.xml", "https://example.com/map.xml#x"])
def test_invalid_sitemap_url(session: MagicMock, url: str) -> None:
    with GoogleEngine(Credentials(token="test")) as engine:
        with pytest.raises(ValueError):
            engine.submit_sitemap(SITE_URL, url)
    session.put.assert_not_called()


# 신규 사이트는 등록 후 인증 파일을 안내하며 사람의 설치를 기다립니다.
def test_setup_new_site_waits_for_installation(session: MagicMock) -> None:
    session.get.return_value.status_code = 404
    session.put.return_value.status_code = 204
    session.post.return_value.status_code = 200
    session.post.return_value.json.return_value = {"method": "FILE", "token": "google123.html"}
    with GoogleEngine(Credentials(token="test")) as engine:
        result = engine.register_new_site(SITE_URL, "https://example.com/sitemap.xml")
    assert result.status == "verification_required"
    assert result.verification_file is not None
    assert result.verification_file.file_name == "google123.html"
    assert session.put.call_count == 1
    session.post.assert_called_once()
    assert session.post.call_args.args[0].endswith("/token")
    assert [item[0] for item in session.method_calls] == ["get", "put", "post", "close"]


# 등록돼 있지만 소유 확인이 안 된 사이트에는 중복 등록 없이 설치 정보를 안내합니다.
def test_setup_unverified_site(session: MagicMock) -> None:
    session.get.return_value.json.return_value = {
        "siteUrl": SITE_URL, "permissionLevel": "siteUnverifiedUser"
    }
    session.post.return_value.status_code = 200
    session.post.return_value.json.return_value = {"method": "FILE", "token": "google123.html"}
    with GoogleEngine(Credentials(token="test")) as engine:
        result = engine.register_new_site(SITE_URL, "https://example.com/sitemap.xml")
    assert result.status == "verification_required"
    session.put.assert_not_called()


# 기존 소유자는 인증 단계를 건너뛰고 사이트맵만 제출합니다.
def test_setup_existing_owner(session: MagicMock) -> None:
    session.put.return_value.status_code = 204
    with GoogleEngine(Credentials(token="test")) as engine:
        result = engine.register_new_site(SITE_URL, "https://example.com/sitemap.xml")
    assert result.status == "completed"
    assert result.verification_file is None
    session.post.assert_not_called()
    assert "/sitemaps/" in session.put.call_args.args[0]


# 사람이 설치를 마친 경우 소유 확인과 권한 재조회를 거쳐 사이트맵을 제출합니다.
def test_setup_resumes_after_installation(session: MagicMock) -> None:
    unverified = MagicMock(status_code=200)
    unverified.json.return_value = {"siteUrl": SITE_URL, "permissionLevel": "siteUnverifiedUser"}
    owner = MagicMock(status_code=200)
    owner.json.return_value = {"siteUrl": SITE_URL, "permissionLevel": "siteOwner"}
    session.get.side_effect = [unverified, owner]
    session.post.return_value.status_code = 200
    session.post.return_value.json.return_value = {
        "id": "test-resource", "site": {"type": "SITE", "identifier": SITE_URL}
    }
    session.put.return_value.status_code = 204
    with GoogleEngine(Credentials(token="test")) as engine:
        result = engine.register_new_site(SITE_URL, "https://example.com/sitemap.xml", verification_ready=True)
    assert result.status == "completed"
    assert session.post.call_args.args[0].endswith("/webResource")
    assert [item[0] for item in session.method_calls] == ["get", "post", "get", "put", "close"]


# 사용자가 설치 완료를 눌러도 Google 인증에 실패하면 사이트맵을 제출하지 않습니다.
def test_setup_stops_on_verification_failure(session: MagicMock) -> None:
    session.get.return_value.json.return_value = {
        "siteUrl": SITE_URL, "permissionLevel": "siteUnverifiedUser"
    }
    session.post.return_value.status_code = 400
    with GoogleEngine(Credentials(token="test")) as engine:
        with pytest.raises(GoogleEngineError):
            engine.register_new_site(SITE_URL, "https://example.com/sitemap.xml", verification_ready=True)
    session.put.assert_not_called()


# 소유 확인 후 Search Console 권한이 아직 반영되지 않았으면 완료로 반환하지 않습니다.
def test_setup_requires_confirmed_owner(session: MagicMock) -> None:
    session.get.return_value.json.return_value = {
        "siteUrl": SITE_URL, "permissionLevel": "siteFullUser"
    }
    session.post.return_value.status_code = 200
    session.post.return_value.json.return_value = {
        "id": "test-resource", "site": {"type": "SITE", "identifier": SITE_URL}
    }
    with GoogleEngine(Credentials(token="test")) as engine:
        with pytest.raises(GoogleEngineError) as caught:
            engine.register_new_site(SITE_URL, "https://example.com/sitemap.xml", verification_ready=True)
    assert caught.value.code == "permission"
    session.put.assert_not_called()


# 잘못된 사이트맵은 사이트 등록 등 외부 변경을 시작하기 전에 거부합니다.
def test_setup_validates_before_registration(session: MagicMock) -> None:
    with GoogleEngine(Credentials(token="test")) as engine:
        with pytest.raises(ValueError):
            engine.register_new_site(SITE_URL, "file:///tmp/sitemap.xml")
    session.get.assert_not_called()
    session.put.assert_not_called()


# 사이트맵 제출이 실패한 경우 소유자라도 전체 완료를 반환하지 않습니다.
def test_setup_stops_on_sitemap_failure(session: MagicMock) -> None:
    session.put.return_value.status_code = 500
    with GoogleEngine(Credentials(token="test")) as engine:
        with pytest.raises(GoogleEngineError):
            engine.register_new_site(SITE_URL, "https://example.com/sitemap.xml")


# Google 색인 판정과 크롤링 이력을 함께 반환하며 색인 요청이나 등록은 실행하지 않습니다.
def test_inspect_indexed_url(session: MagicMock) -> None:
    page_url = SITE_URL + "first-post?lang=ko"
    session.post.return_value.status_code = 200
    session.post.return_value.json.return_value = {
        "inspectionResult": {
            "inspectionResultLink": "https://search.google.com/search-console/inspect?test=1",
            "indexStatusResult": {
                "verdict": "PASS", "coverageState": "제출 및 색인 생성됨",
                "lastCrawlTime": "2026-10-27T01:02:03Z", "pageFetchState": "SUCCESSFUL",
                "indexingState": "INDEXING_ALLOWED", "robotsTxtState": "ALLOWED",
                "googleCanonical": page_url, "userCanonical": page_url,
            },
        }
    }
    before = datetime.now(timezone.utc)
    with GoogleEngine(Credentials(token="test")) as engine:
        result = engine.inspect_url(SITE_URL, page_url)
    assert result.index_status == "indexed"
    assert result.page_url == page_url
    assert result.verdict == "PASS"
    assert result.last_crawl_time == datetime(2026, 10, 27, 1, 2, 3, tzinfo=timezone.utc)
    assert before <= result.checked_at <= datetime.now(timezone.utc)
    assert result.google_canonical == page_url
    assert result.page_fetch_state == "SUCCESSFUL"
    session.post.assert_called_once_with(
        "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
        json={"siteUrl": SITE_URL, "inspectionUrl": page_url, "languageCode": "ko-KR"},
        timeout=30, allow_redirects=False,
    )
    session.get.assert_not_called()
    session.put.assert_not_called()


# 미색인 판정은 수집 이력보다 우선하며 알 수 없는 판정은 추측하지 않습니다.
@pytest.mark.parametrize("index, expected", [
    ({"verdict": "NEUTRAL", "coverageState": "Google에는 아직 알려지지 않은 URL입니다."}, "not_indexed"),
    ({"verdict": "FAIL", "indexingState": "BLOCKED_BY_META_TAG"}, "not_indexed"),
    ({"verdict": "NEUTRAL", "lastCrawlTime": "2026-10-25T01:00:00Z"}, "not_indexed"),
    ({"verdict": "VERDICT_UNSPECIFIED", "lastCrawlTime": "2026-10-25T01:00:00Z"}, "crawled"),
    ({"lastCrawlTime": "2026-10-25T01:00:00Z"}, "crawled"),
    ({"verdict": "VERDICT_UNSPECIFIED"}, "unknown"),
    ({"verdict": "PARTIAL"}, "unknown"),
    ({"verdict": "NEW_FUTURE_VALUE"}, "unknown"),
    ({"verdict": "NEW_FUTURE_VALUE", "lastCrawlTime": "2026-10-25T01:00:00Z"}, "unknown"),
    ({}, "unknown"),
    ({"indexingState": "INDEXING_ALLOWED", "pageFetchState": "SUCCESSFUL"}, "unknown"),
])
def test_inspection_status_mapping(session: MagicMock, index: object, expected: str) -> None:
    session.post.return_value.status_code = 200
    session.post.return_value.json.return_value = {"inspectionResult": {"indexStatusResult": index}}
    with GoogleEngine(Credentials(token="test")) as engine:
        result = engine.inspect_url(SITE_URL, SITE_URL)
    assert result.index_status == expected


# 다른 호스트·프로토콜·속성 경로 밖의 페이지를 조회하지 않습니다.
@pytest.mark.parametrize("page_url", [
    "https://other.example/blog/post", "http://example.com/blog/post",
    "https://example.com/blogger/post", "https://example.com/other/post",
    "https://example.com.evil.test/blog/post", "https://user:pass@example.com/blog/post",
    "https://example.com/blog/post#part", "file:///tmp/test",
])
def test_inspection_rejects_out_of_scope_page(session: MagicMock, page_url: str) -> None:
    with GoogleEngine(Credentials(token="test")) as engine:
        with pytest.raises(ValueError):
            engine.inspect_url(SITE_URL, page_url)
    session.post.assert_not_called()


# 응답 누락과 잘못된 값은 미색인 대신 기술적인 응답 오류로 전달합니다.
@pytest.mark.parametrize("data", [
    {}, {"inspectionResult": None}, {"inspectionResult": []}, {"inspectionResult": {}},
    {"inspectionResult": {"indexStatusResult": []}},
    {"inspectionResult": {"indexStatusResult": {"verdict": []}}},
    {"inspectionResult": {"indexStatusResult": {"lastCrawlTime": "test-secret"}}},
    {"inspectionResult": {"indexStatusResult": {"lastCrawlTime": "2026-10-25T01:00:00"}}},
    {"inspectionResult": {"indexStatusResult": {"googleCanonical": 123}}},
])
def test_invalid_inspection_response(session: MagicMock, data: object) -> None:
    session.post.return_value.status_code = 200
    session.post.return_value.json.return_value = data
    with GoogleEngine(Credentials(token="test")) as engine:
        with pytest.raises(GoogleEngineError) as caught:
            engine.inspect_url(SITE_URL, SITE_URL)
    assert caught.value.code == "response"
    assert "test-secret" not in str(caught.value)


# API가 URL을 찾지 못하거나 권한·호출 제한 오류가 나도 미색인 결과로 바꾸지 않습니다.
@pytest.mark.parametrize("status, code", [
    (401, "authentication"), (403, "permission"), (404, "response"),
    (429, "rate_limit"), (500, "response"),
])
def test_inspection_http_errors(session: MagicMock, status: int, code: str) -> None:
    session.post.return_value.status_code = status
    session.post.return_value.json.return_value = {"error": {"message": "test-secret"}}
    with GoogleEngine(Credentials(token="test")) as engine:
        with pytest.raises(GoogleEngineError) as caught:
            engine.inspect_url(SITE_URL, SITE_URL)
    assert caught.value.code == code
    assert caught.value.status_code == status


# 통신 시간이 초과되면 기존 관측과 구분할 수 있는 기술 오류를 반환합니다.
def test_inspection_timeout(session: MagicMock) -> None:
    session.post.side_effect = Timeout("test-secret")
    with GoogleEngine(Credentials(token="test")) as engine:
        with pytest.raises(GoogleEngineError) as caught:
            engine.inspect_url(SITE_URL, SITE_URL)
    assert caught.value.code == "timeout"
    assert "test-secret" not in str(caught.value)
