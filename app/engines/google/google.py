"""Google 사이트 등록·소유 확인·사이트맵 제출·색인 상태 조회를 처리합니다."""

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from types import TracebackType
from typing import Literal, Self
from urllib.parse import quote, urlsplit

from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import AuthorizedSession
from google.oauth2.credentials import Credentials
from requests import Response
from requests.exceptions import RequestException, Timeout

SITES_ENDPOINT = "https://www.googleapis.com/webmasters/v3/sites"
VERIFICATION_ENDPOINT = "https://www.googleapis.com/siteVerification/v1"
INSPECTION_ENDPOINT = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect"
REQUEST_TIMEOUT = 30
ErrorCode = Literal["authentication", "permission", "rate_limit", "timeout", "connection", "response"]
IndexStatus = Literal["unknown", "crawled", "indexed", "not_indexed"]


@dataclass(frozen=True)
class GoogleSite:
    """현재 계정에서 조회한 속성 정보이며 색인 완료를 의미하지 않습니다."""

    site_url: str
    permission_level: str


@dataclass(frozen=True)
class GoogleVerificationFile:
    """화면에서 설치를 안내할 공개 인증 파일 정보입니다."""

    file_name: str
    file_content: str
    verification_url: str


@dataclass(frozen=True)
class GoogleOwnership:
    """Google이 소유 확인을 완료한 사이트와 리소스 ID입니다."""

    site_url: str
    resource_id: str


@dataclass(frozen=True)
class GoogleSiteSetup:
    """설치 대기 또는 등록·소유 확인·사이트맵 접수 완료 결과이며 색인 결과는 아닙니다."""

    site_url: str
    status: Literal["verification_required", "completed"]
    verification_file: GoogleVerificationFile | None = None


@dataclass(frozen=True)
class GoogleUrlInspection:
    """Google에 저장된 URL 관측이며 현재 실시간 상태나 크롤링 대기를 보장하지 않습니다."""

    site_url: str
    page_url: str
    index_status: IndexStatus
    checked_at: datetime
    verdict: str | None
    coverage_state: str | None
    last_crawl_time: datetime | None
    page_fetch_state: str | None
    indexing_state: str | None
    robots_txt_state: str | None
    google_canonical: str | None
    user_canonical: str | None
    inspection_result_link: str | None


class GoogleEngineError(Exception):
    """서비스에서 분류할 수 있고 Google 오류 원문을 포함하지 않는 오류입니다."""

    # 원본 응답 대신 안전한 오류 코드와 HTTP 상태만 보관합니다.
    def __init__(self, code: ErrorCode, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


class GoogleEngine:
    """DB와 독립적인 동기 어댑터로, FastAPI에서는 스레드풀이나 워커에서 호출합니다."""

    # 외부에서 준비한 인증 객체로 Google 전용 세션을 생성합니다.
    def __init__(self, credentials: Credentials) -> None:
        self._session = AuthorizedSession(credentials, refresh_timeout=REQUEST_TIMEOUT)

    # with 블록 안에서 어댑터를 사용할 수 있게 합니다.
    def __enter__(self) -> Self:
        return self

    # 성공 여부와 관계없이 HTTP 세션을 정리합니다.
    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self.close()

    # 세션이 사용하는 연결을 종료합니다.
    def close(self) -> None:
        self._session.close()

    # ================== 1. 새로운 사이트 등록 ====================

    # URL-prefix 사이트 등록 절차를 묶고, 인증 파일 설치가 필요하면 안내 정보를 반환합니다.
    def register_new_site(
        self,
        site_url: str,
        sitemap_url: str,
        *,
        verification_ready: bool = False,
    ) -> GoogleSiteSetup:
        """파일 설치 후 verification_ready=True로 다시 호출하며 DB 저장·알림은 서비스가 담당합니다."""
        # 등록 후 입력 오류로 중단되지 않도록 외부 요청 전에 두 주소를 확인합니다.
        self._validate_http_url(site_url, site_root=True)
        self._validate_http_url(sitemap_url)

        site = self.get_site(site_url)

        if site is None:
            self.register_site(site_url)

        if site is None or site.permission_level != "siteOwner":
            if not verification_ready:
                return GoogleSiteSetup(
                    site_url=site_url,
                    status="verification_required",
                    verification_file=self.get_verification_token(site_url),
                )

            # 설치 완료 입력은 사용자 의사 표시이며 실제 소유 확인은 Google이 수행합니다.
            self.verify_ownership(site_url)

            verified_site = self.get_site(site_url)
            if verified_site is None or verified_site.permission_level != "siteOwner":
                raise GoogleEngineError(
                    "permission", "Google 소유 확인 후 Search Console 소유자 권한을 확인하지 못했습니다. 다시 조회하세요."
                )

        self.submit_sitemap(site_url, sitemap_url)

        return GoogleSiteSetup(site_url=site_url, status="completed")

    # 정확한 Search Console 속성을 조회하고, 현재 계정에서 찾지 못하면 None을 반환합니다.
    def get_site(self, site_url: str) -> GoogleSite | None:
        self._validate_property(site_url)

        response = self._request(
            "get", f"{SITES_ENDPOINT}/{quote(site_url, safe='')}", allow_not_found=True
        )
        if response is None:
            return None

        data = self._read_json(response)
        permission_level = data.get("permissionLevel")
        if (
            data.get("siteUrl") != site_url
            or not isinstance(permission_level, str)
            or permission_level not in (
                "siteOwner", "siteFullUser", "siteRestrictedUser", "siteUnverifiedUser"
            )
        ):
            raise GoogleEngineError("response", "Google 사이트 응답 필드를 확인하세요.", 200)

        return GoogleSite(site_url=site_url, permission_level=permission_level)

    # Search Console에 속성을 추가하며, 소유 확인이나 색인 완료를 의미하지 않습니다.
    def register_site(self, site_url: str) -> bool:
        self._validate_property(site_url)
        self._request(
            "put", f"{SITES_ENDPOINT}/{quote(site_url, safe='')}", success_codes=(200, 204)
        )

        return True

    # FILE 방식 인증 파일 정보를 발급하며, 파일 생성·배포는 호출자가 담당합니다.
    def get_verification_token(self, site_url: str) -> GoogleVerificationFile:
        self._validate_http_url(site_url, site_root=True)

        response = self._request(
            "post", f"{VERIFICATION_ENDPOINT}/token",
            json={
                "site": {"type": "SITE", "identifier": site_url},
                "verificationMethod": "FILE",
            },
        )
        data = self._read_json(response)
        token = data.get("token")
        if (
            data.get("method") != "FILE"
            or not isinstance(token, str)
            or re.fullmatch(r"google[A-Za-z0-9_-]+\.html", token) is None
        ):
            raise GoogleEngineError("response", "Google 인증 파일 응답이 올바르지 않습니다.", 200)

        return GoogleVerificationFile(
            file_name=token,
            file_content=f"google-site-verification: {token}",
            verification_url=f"{site_url}{token}",
        )

    # 사용자가 인증 파일을 배포한 뒤 Google에 실제 소유 확인을 요청합니다.
    def verify_ownership(self, site_url: str) -> GoogleOwnership:
        self._validate_http_url(site_url, site_root=True)

        response = self._request(
            "post", f"{VERIFICATION_ENDPOINT}/webResource",
            params={"verificationMethod": "FILE"},
            json={"site": {"type": "SITE", "identifier": site_url}},
        )
        data = self._read_json(response)
        site = data.get("site")
        resource_id = data.get("id")
        if (
            not isinstance(site, dict)
            or site.get("type") != "SITE"
            or site.get("identifier") != site_url
            or not isinstance(resource_id, str)
            or not resource_id.strip()
        ):
            raise GoogleEngineError("response", "Google 소유 확인 응답이 올바르지 않습니다.", 200)

        # 다른 소유자의 이메일 등 불필요한 개인정보는 결과에 포함하지 않습니다.
        return GoogleOwnership(site_url=site_url, resource_id=resource_id)

    # 이미 배포된 사이트맵의 주소만 제출하며, 파일 갱신이나 색인을 수행하지 않습니다.
    def submit_sitemap(self, site_url: str, sitemap_url: str) -> bool:
        self._validate_property(site_url)
        self._validate_http_url(sitemap_url)

        endpoint = (
            f"{SITES_ENDPOINT}/{quote(site_url, safe='')}/sitemaps/"
            f"{quote(sitemap_url, safe='')}"
        )

        self._request("put", endpoint, success_codes=(200, 204))

        return True

    # =============================================================

    # ====================== 3. 상태 확인 ==========================

    # 메인페이지 또는 글의 Google 색인 판정·수집 시각을 조회하며 제출 작업은 실행하지 않습니다.
    def inspect_url(self, site_url: str, page_url: str) -> GoogleUrlInspection:
        self._validate_http_url(site_url, site_root=True)
        self._validate_http_url(page_url)

        # URL-prefix 속성의 정확한 접두어를 사용하며 경계 밖의 URL은 호출 전에 거부합니다.
        if not page_url.startswith(site_url):
            raise ValueError("검사할 URL은 지정한 Search Console 속성 아래에 있어야 합니다.")

        response = self._request(
            "post", INSPECTION_ENDPOINT,
            json={"siteUrl": site_url, "inspectionUrl": page_url, "languageCode": "ko-KR"},
        )
        data = self._read_json(response)
        inspection = data.get("inspectionResult")
        if not isinstance(inspection, dict):
            raise GoogleEngineError("response", "Google URL 검사 응답이 올바르지 않습니다.", 200)

        index = inspection.get("indexStatusResult")
        if not isinstance(index, dict):
            raise GoogleEngineError("response", "Google 색인 검사 결과가 없습니다.", 200)

        verdict = self._optional_string(index, "verdict")
        crawl_value = self._optional_string(index, "lastCrawlTime")
        last_crawl_time = self._parse_crawl_time(crawl_value)
        # 제외·오류 판정은 수집 이력보다 우선하며 번역된 coverageState로 분류하지 않습니다.
        status: IndexStatus = "unknown"

        if verdict == "PASS":
            status = "indexed"
        elif verdict in ("FAIL", "NEUTRAL"):
            status = "not_indexed"
        elif verdict in (None, "VERDICT_UNSPECIFIED") and last_crawl_time is not None:
            status = "crawled"

        return GoogleUrlInspection(
            site_url=site_url,
            page_url=page_url,
            index_status=status,
            checked_at=datetime.now(timezone.utc),
            verdict=verdict,
            coverage_state=self._optional_string(index, "coverageState"),
            last_crawl_time=last_crawl_time,
            page_fetch_state=self._optional_string(index, "pageFetchState"),
            indexing_state=self._optional_string(index, "indexingState"),
            robots_txt_state=self._optional_string(index, "robotsTxtState"),
            google_canonical=self._optional_string(index, "googleCanonical"),
            user_canonical=self._optional_string(index, "userCanonical"),
            inspection_result_link=self._optional_string(inspection, "inspectionResultLink"),
        )

    # =============================================================

    # 선택적 문자열 필드의 누락은 허용하고 잘못된 자료형은 응답 오류로 처리합니다.
    @staticmethod
    def _optional_string(data: dict[str, object], key: str) -> str | None:
        value = data.get(key)
        if value is None:
            return None
        if not isinstance(value, str) or not value.strip():
            raise GoogleEngineError("response", "Google URL 검사 응답 필드가 올바르지 않습니다.", 200)

        return value

    # 마지막 크롤링 시각을 시간대가 있는 UTC 시각으로 변환합니다.
    @staticmethod
    def _parse_crawl_time(value: str | None) -> datetime | None:
        if value is None:
            return None

        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                raise ValueError
        except ValueError:
            raise GoogleEngineError("response", "Google 크롤링 시각 형식이 올바르지 않습니다.", 200) from None

        return parsed.astimezone(timezone.utc)

    # 속성 식별자의 공백·제어 문자를 거부하며, 정확한 속성 주소는 변경하지 않습니다.
    @staticmethod
    def _validate_property(site_url: str) -> None:
        if not site_url or any(character.isspace() or ord(character) < 32 for character in site_url):
            raise ValueError("공백 없는 Search Console 속성 주소가 필요합니다.")

    # FILE 인증은 HTTP URL-prefix 속성만 지원하며, 도메인 속성은 DNS 인증이 필요합니다.
    @staticmethod
    def _validate_http_url(url: str, *, site_root: bool = False) -> None:
        GoogleEngine._validate_property(url)

        try:
            parsed = urlsplit(url)
            valid = (
                parsed.scheme in ("http", "https") and bool(parsed.hostname)
                and parsed.username is None and parsed.password is None
                and not parsed.fragment and "#" not in url and "\\" not in url
                and (parsed.port is None or 0 < parsed.port <= 65535)
                and (not site_root or (parsed.path.endswith("/") and "?" not in url))
            )
        except ValueError:
            valid = False

        if not valid:
            raise ValueError(
                "FILE 인증은 /로 끝나는 HTTP·HTTPS 사이트 주소가 필요합니다."
                if site_root else "올바른 HTTP·HTTPS 사이트맵 주소가 필요합니다."
            )

    # 공통 타임아웃과 오류 처리를 적용하고 Google 공식 주소로만 요청합니다.
    def _request(
        self,
        method: Literal["get", "post", "put"],
        endpoint: str,
        *,
        success_codes: tuple[int, ...] = (200,),
        allow_not_found: bool = False,
        json: dict[str, object] | None = None,
        params: dict[str, str] | None = None,
    ) -> Response | None:
        options: dict[str, object] = {"timeout": REQUEST_TIMEOUT, "allow_redirects": False}

        if json is not None:
            options = options | {"json": json}

        if params is not None:
            options = options | {"params": params}

        try:
            response = getattr(self._session, method)(endpoint, **options)
        except Timeout:
            raise GoogleEngineError("timeout", "Google API 요청 시간이 초과됐습니다.") from None
        except GoogleAuthError:
            raise GoogleEngineError("authentication", "Google 인증을 확인하세요.") from None
        except RequestException:
            raise GoogleEngineError("connection", "Google 연결에 실패했습니다.") from None

        if response.status_code == 404 and allow_not_found:
            # 전체 인터넷에서 미등록이라는 뜻이 아니라 이 계정에서 속성을 찾지 못한 결과입니다.
            return None
        if response.status_code == 401:
            raise GoogleEngineError("authentication", "Google 인증을 확인하세요.", 401)
        if response.status_code == 429:
            raise GoogleEngineError("rate_limit", "Google 호출 한도를 초과했습니다.", 429)

        if response.status_code == 403:
            # Google은 일부 호출 제한도 403으로 반환하므로 권한 오류와 구분합니다.
            try:
                error = response.json().get("error", {})
                limited = isinstance(error, dict) and (
                    error.get("status") == "RESOURCE_EXHAUSTED"
                    or any(
                        isinstance(item, dict)
                        and item.get("reason") in (
                            "rateLimitExceeded", "userRateLimitExceeded",
                            "quotaExceeded", "dailyLimitExceeded",
                        )
                        for item in error.get("errors", [])
                    )
                )
            except (ValueError, AttributeError, TypeError):
                limited = False

            if limited:
                raise GoogleEngineError("rate_limit", "Google 호출 한도를 초과했습니다.", 403)

            raise GoogleEngineError("permission", "Google 사이트 접근 권한을 확인하세요.", 403)

        if response.status_code not in success_codes:
            raise GoogleEngineError("response", "Google API 요청이 실패했습니다.", response.status_code)

        return response

    # 성공 응답의 JSON 객체를 검증하고 응답 원문은 오류에 포함하지 않습니다.
    @staticmethod
    def _read_json(response: Response | None) -> dict[str, object]:
        if response is None:
            raise GoogleEngineError("response", "Google API 응답이 없습니다.")

        try:
            data = response.json()
        except ValueError:
            raise GoogleEngineError("response", "Google API 응답 형식이 올바르지 않습니다.", response.status_code) from None

        if not isinstance(data, dict):
            raise GoogleEngineError("response", "Google API 응답 필드를 확인하세요.", response.status_code)

        return data
