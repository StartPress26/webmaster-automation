"""Bing 사이트 등록·소유 확인·사이트맵 제출·URL 수집 상태 조회를 처리합니다."""

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Literal
from urllib.parse import urlsplit
from xml.sax.saxutils import escape

import httpx

BING_API_ENDPOINT = "https://ssl.bing.com/webmaster/api.svc/json"
ErrorCode = Literal["authentication", "permission", "rate_limit", "timeout", "connection", "response"]
# 현재 URL 정보 조회만으로는 색인 여부를 확정하지 않습니다.
IndexStatus = Literal["unknown", "crawled"]


@dataclass(frozen=True)
class BingSite:
    """현재 계정에 등록된 사이트와 소유 확인 정보이며 색인 결과는 아닙니다."""

    site_url: str
    is_verified: bool
    authentication_code: str | None = field(default=None, repr=False)


@dataclass(frozen=True)
class BingVerificationFile:
    """등록 대상 사이트에 설치할 공개 인증 XML 파일 정보입니다."""

    file_name: str
    file_content: str
    verification_url: str


@dataclass(frozen=True)
class BingSiteSetup:
    """인증 파일 설치 대기 또는 등록·소유 확인·사이트맵 접수 완료 결과입니다.

    completed는 실제 크롤링·색인 완료를 의미하지 않습니다.
    """

    site_url: str
    status: Literal["verification_required", "completed"]
    verification_file: BingVerificationFile | None = None


@dataclass(frozen=True)
class BingUrlInspection:
    """Bing에 기록된 URL 관측이며 실시간 상태나 색인 완료를 보장하지 않습니다.

    checked_at과 날짜 필드는 UTC 시간대가 있는 datetime을 사용합니다.
    미래의 discovery_date는 원본 관측으로 보존하되 시간 순서 계산에 사용하지 않습니다.
    http_status는 Bing이 기록한 대상 페이지의 상태이며 API 응답 상태와 다릅니다.
    """

    site_url: str
    page_url: str
    index_status: IndexStatus
    checked_at: datetime
    discovery_date: datetime | None
    last_crawl_time: datetime | None
    http_status: int | None
    is_page: bool | None
    document_size: int | None


class BingEngineError(Exception):
    """호출자가 분류할 수 있는 오류이며 API 키나 원본 응답을 전달하지 않습니다."""

    # 안전하게 작성한 메시지와 오류 분류·API 응답 상태만 보관합니다.
    def __init__(self, code: ErrorCode, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


@dataclass(frozen=True)
class BingEngine:
    """API 키와 전용 비동기 클라이언트를 주입받는 DB 독립 어댑터입니다.

    클라이언트 생성·종료는 호출자가 담당하며 다른 서비스의 인증 설정을 공유하지 않습니다.
    재시도는 호출자가 결정합니다. 시간 초과는 서버의 처리 실패를 의미하지 않습니다.
    """

    api_key: str = field(repr=False)
    # 실제 HTTP 요청을 보내는 객체
    http_client: httpx.AsyncClient = field(repr=False)

    # 비어 있거나 공백·제어 문자가 포함된 API 키를 전송 전에 거부합니다.
    def __post_init__(self) -> None:
        if not self.api_key or any(
            character.isspace() or ord(character) < 32 or ord(character) == 127
            for character in self.api_key
        ):
            raise BingEngineError("authentication", "Bing API 키 설정을 확인하세요.")

    # 등록 절차를 묶고 인증 파일 설치가 필요하면 안내를 반환하여 나중에 재개합니다.
    async def register_new_site(
        self,
        site_url: str,
        sitemap_url: str,
        *,
        verification_ready: bool = False,
    ) -> BingSiteSetup:
        """루트 사이트의 XML 인증을 지원하며 DB 저장·파일 배포는 호출자가 담당합니다."""
        # 등록 이후에 입력 오류로 중단되지 않도록 외부 요청 전에 모두 검증합니다.
        self._validate_site_url(site_url)
        self._validate_site_url(sitemap_url)

        parsed = urlsplit(site_url)
        if parsed.path not in ("", "/") or parsed.query:
            raise ValueError("XML 인증에는 경로·쿼리 없는 루트 사이트 URL이 필요합니다.")
        if type(verification_ready) is not bool:
            raise ValueError("verification_ready에는 bool 값을 전달하세요.")

        existing_site = await self.get_site(site_url)

        site = existing_site if existing_site is not None else await self.register_site(site_url)

        if not site.is_verified:
            if not verification_ready:
                return BingSiteSetup(
                    site_url=site_url,
                    status="verification_required",
                    verification_file=await self.get_verification_file(site_url),
                )

            # 설치 완료 입력만 믿지 않고 Bing의 확인·재조회가 성공해야 다음 단계로 갑니다.
            await self.verify_ownership(site_url)

        await self.submit_sitemap(site_url, sitemap_url)

        return BingSiteSetup(site_url=site_url, status="completed")

    # 현재 계정의 목록에서 정확히 일치하는 사이트를 찾고 없으면 None을 반환합니다.
    async def get_site(self, site_url: str) -> BingSite | None:
        """등록·소유 확인은 실행하지 않으며 URL의 경로·쿼리·끝 슬래시를 보정하지 않습니다."""
        self._validate_site_url(site_url)

        # BingEngine에 넣은 API 키의 소유 계정에 등록된 사이트 목록
        # 소유 확인이 완료된 사이트뿐 아니라 등록했지만 아직 인증하지 않은 사이트도 포함
        data = await self._request("get", "GetUserSites")
        if not isinstance(data, list):
            raise BingEngineError("response", "Bing 사이트 목록 응답이 올바르지 않습니다.", 200)

        # 응답 누락이나 잘못된 자료형을 미등록 또는 미인증으로 해석하지 않습니다.
        for item in data:
            if (
                not isinstance(item, dict)
                or not isinstance(item.get("Url"), str)
                or not item["Url"].strip()
                or type(item.get("IsVerified")) is not bool
                or (
                    item.get("AuthenticationCode") is not None
                    and not isinstance(item["AuthenticationCode"], str)
                )
            ):
                raise BingEngineError("response", "Bing 사이트 응답 필드를 확인하세요.", 200)

        matches = tuple(item for item in data if item["Url"] == site_url)
        if len(matches) > 1:
            raise BingEngineError("response", "Bing 사이트 조회 결과가 중복되었습니다.", 200)
        if not matches:
            return None

        site = matches[0]

        return BingSite(
            site_url=site["Url"],
            is_verified=site["IsVerified"],
            authentication_code=site.get("AuthenticationCode") or None,
        )

    # 사이트 추가 후 목록을 다시 조회하여 등록을 확인한 사이트 정보를 반환합니다.
    async def register_site(self, site_url: str) -> BingSite:
        """소유 확인·사이트맵 제출은 실행하지 않으며 기존 사이트의 인증 상태를 유지합니다."""
        self._validate_site_url(site_url)
        result = await self._request("post", "AddSite", json={"siteUrl": site_url})
        if result is not None:
            raise BingEngineError("response", "Bing 사이트 등록 응답이 올바르지 않습니다.", 200)

        site = await self.get_site(site_url)
        if site is None:
            # 반영 지연일 수 있으므로 등록 실패로 단정하거나 AddSite를 자동 재전송하지 않습니다.
            raise BingEngineError(
                "response", "Bing 등록 요청 후 사이트를 확인하지 못했습니다. 다시 조회하세요.", 200,
            )

        return site

    # 등록된 사이트의 인증 코드로 배포할 XML 내용과 설치 주소를 구성합니다.
    async def get_verification_file(self, site_url: str) -> BingVerificationFile:
        """현재는 루트 사이트의 XML 인증만 지원하며 파일 생성·배포·소유 확인은 하지 않습니다."""
        self._validate_site_url(site_url)

        parsed = urlsplit(site_url)
        if parsed.path not in ("", "/") or parsed.query:
            raise ValueError("XML 인증에는 경로·쿼리 없는 루트 사이트 URL이 필요합니다.")

        site = await self.get_site(site_url)
        if site is None:
            raise BingEngineError("permission", "Bing에 사이트를 먼저 등록한 뒤 인증 정보를 조회하세요.")

        code = site.authentication_code
        if not code or any(
            character.isspace() or ord(character) < 32 or ord(character) == 127
            for character in code
        ):
            raise BingEngineError("response", "Bing 사이트 인증 코드를 확인하지 못했습니다.", 200)

        file_name = "BingSiteAuth.xml"
        # 인증 코드를 XML 텍스트로 이스케이프하여 별도 태그로 해석되지 않게 합니다.
        file_content = (
            '<?xml version="1.0" encoding="utf-8"?>\n'
            "<users>\n"
            f"    <user>{escape(code)}</user>\n"
            "</users>\n"
        )

        return BingVerificationFile(
            file_name=file_name,
            file_content=file_content,
            verification_url=parsed._replace(path=f"/{file_name}").geturl(),
        )

    # Bing에 소유 확인을 요청하고 사이트 목록에서도 인증 완료를 재확인합니다.
    async def verify_ownership(self, site_url: str) -> BingSite:
        """인증 파일 배포 후 호출하며 사이트 등록·파일 배포·사이트맵 제출은 하지 않습니다."""
        self._validate_site_url(site_url)
        result = await self._request("post", "VerifySite", json={"siteUrl": site_url})
        if type(result) is not bool:
            raise BingEngineError("response", "Bing 소유 확인 응답이 올바르지 않습니다.", 200)
        if not result:
            raise BingEngineError(
                "permission", "Bing 소유 확인이 완료되지 않았습니다. 인증 파일 배포를 확인하세요.", 200,
            )

        site = await self.get_site(site_url)
        if site is None or not site.is_verified:
            # API의 성공 응답과 조회 결과가 일치하지 않으면 완료로 단정하지 않습니다.
            raise BingEngineError(
                "permission", "Bing 소유 확인 후 인증 완료 상태를 확인하지 못했습니다. 다시 조회하세요.", 200,
            )

        return site

    # 이미 배포된 사이트맵의 주소를 Bing에 제출하고 정상 접수 여부를 반환합니다.
    async def submit_sitemap(self, site_url: str, sitemap_url: str) -> bool:
        """파일 생성·갱신은 하지 않으며 접수 성공은 다운로드·크롤링·색인 완료가 아닙니다."""
        self._validate_site_url(site_url)
        self._validate_site_url(sitemap_url)
        result = await self._request(
            "post", "SubmitFeed", json={"siteUrl": site_url, "feedUrl": sitemap_url},
        )
        if result is not None:
            raise BingEngineError("response", "Bing 사이트맵 제출 응답이 올바르지 않습니다.", 200)

        return True

    # 루트 사이트의 메인페이지·글에 대해 Bing이 기록한 수집 정보를 조회합니다.
    async def inspect_url(self, site_url: str, page_url: str) -> BingUrlInspection:
        """조회만 실행하며 색인 판정·URL 제출·DB 저장은 수행하지 않습니다."""
        self._validate_site_url(site_url)
        self._validate_site_url(page_url)

        site = urlsplit(site_url)
        page = urlsplit(page_url)

        if site.path not in ("", "/") or site.query:
            raise ValueError("URL 조회에는 경로·쿼리 없는 루트 사이트 URL이 필요합니다.")

        # 문자열 접두어 대신 호스트·스킴·실제 포트를 비교해 다른 사이트를 차단합니다.
        # 메인 사이트하고 조회할 사이트가 같은 곳인지 확인
        site_origin = (site.scheme, site.hostname, site.port or (443 if site.scheme == "https" else 80))
        page_origin = (page.scheme, page.hostname, page.port or (443 if page.scheme == "https" else 80))
        if site_origin != page_origin:
            raise ValueError("검사할 URL은 지정한 Bing 사이트와 같은 출처에 있어야 합니다.")

        data = await self._request("get", "GetUrlInfo", params={"siteUrl": site_url, "url": page_url})

        checked_at = datetime.now(timezone.utc)

        if not isinstance(data, dict) or data.get("Url") != page_url:
            raise BingEngineError("response", "Bing URL 조회 대상 또는 응답 형식을 확인하세요.", 200)

        discovery_date = self._parse_api_date(data.get("DiscoveryDate"))
        last_crawl_time = self._parse_api_date(data.get("LastCrawledDate"))
        http_status = self._optional_nonnegative_int(data, "HttpStatus")
        document_size = self._optional_nonnegative_int(data, "DocumentSize")
        is_page = data.get("IsPage")

        if is_page is not None and type(is_page) is not bool:
            raise BingEngineError("response", "Bing URL 페이지 여부의 자료형을 확인하세요.", 200)
        if http_status is not None and http_status != 0 and not 100 <= http_status <= 599:
            raise BingEngineError("response", "Bing 기록 HTTP 상태를 확인하세요.", 200)

        # 기본값·미래 시각은 수집 근거로 쓰지 않고 IsPage로 색인 여부를 추측하지 않습니다.
        index_status: IndexStatus = (
            "crawled" if last_crawl_time is not None
            and datetime(1970, 1, 1, tzinfo=timezone.utc) < last_crawl_time <= checked_at
            else "unknown"
        )

        return BingUrlInspection(
            site_url=site_url, page_url=page_url, index_status=index_status,
            checked_at=checked_at, discovery_date=discovery_date, last_crawl_time=last_crawl_time,
            http_status=http_status, is_page=is_page, document_size=document_size,
        )

    # Bing의 밀리초 날짜를 UTC로 변환하고 기본 날짜는 관측 없음으로 처리합니다.
    @staticmethod
    def _parse_api_date(value: object) -> datetime | None:
        if value is None:
            return None

        match = re.fullmatch(r"/Date\((-?\d{1,18})([+-]\d{4})?\)/", value) if isinstance(value, str) else None
        if match is None:
            raise BingEngineError("response", "Bing 날짜 응답 형식을 확인하세요.", 200)

        milliseconds = int(match[1])
        offset = match[2]
        if offset is not None and (int(offset[1:3]) > 23 or int(offset[3:]) > 59):
            raise BingEngineError("response", "Bing 날짜 시간대 표기를 확인하세요.", 200)
        if milliseconds in (0, -62135596800000):
            return None

        try:
            # 밀리초 자체가 UTC 기준이므로 뒤의 시간대 오프셋을 다시 더하지 않습니다.
            return datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(milliseconds=milliseconds)
        except OverflowError:
            raise BingEngineError("response", "Bing 날짜가 지원 범위를 벗어났습니다.", 200) from None

    # 선택적 숫자 필드에서 누락은 허용하되 bool·음수·잘못된 자료형은 거부합니다.
    @staticmethod
    def _optional_nonnegative_int(data: dict[str, object], key: str) -> int | None:
        value = data.get(key)
        if value is not None and (type(value) is not int or value < 0):
            raise BingEngineError("response", "Bing URL 숫자 응답 필드를 확인하세요.", 200)
        return value

    # 사이트와 사이트맵에 같은 URL 검증을 사용하고 잘못된 주소의 외부 전송을 막습니다.
    @staticmethod
    def _validate_site_url(site_url: str) -> None:
        try:
            parsed = urlsplit(site_url)
            port = parsed.port
        except ValueError:
            raise ValueError("유효한 HTTP 또는 HTTPS 사이트 URL이 필요합니다.") from None

        if (
            parsed.scheme not in ("http", "https")
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or port == 0
            or "#" in site_url
            or "\\" in site_url
            or any(character.isspace() or ord(character) < 32 or ord(character) == 127 for character in site_url)
        ):
            raise ValueError("인증정보·공백·프래그먼트 없는 HTTP 또는 HTTPS 사이트 URL이 필요합니다.")

    # 공식 JSON API로 한 번 요청하고 오류를 분류한 뒤 d 안의 결과를 반환합니다.
    async def _request(
        self,
        method: Literal["get", "post"],
        operation: str,
        *,
        params: dict[str, str] | None = None,
        json: dict[str, object] | None = None,
    ) -> object:
        # 외부 URL이나 쿼리가 들어와 인증 키의 전송 대상이 바뀌지 않게 합니다.
        if (
            method not in ("get", "post")
            or not operation.isascii()
            or not operation.isalpha()
        ):
            raise ValueError("Bing API 메서드와 작업 이름을 확인하세요.")
        if params is not None and any(key.lower() == "apikey" for key in params):
            raise ValueError("API 키는 BingEngine 생성 시에만 전달하세요.")

        try:
            response = await self.http_client.request(
                method,
                f"{BING_API_ENDPOINT}/{operation}",
                params=(params or {}) | {"apikey": self.api_key},
                json=json,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json; charset=utf-8",
                },
                timeout=httpx.Timeout(30.0, connect=10.0),
                follow_redirects=False,
            )
        except httpx.TimeoutException:
            raise BingEngineError("timeout", "Bing API 요청 시간이 초과됐습니다.") from None
        except httpx.RequestError:
            # 원본 예외의 요청 URL에는 API 키가 포함될 수 있습니다.
            raise BingEngineError("connection", "Bing API 연결에 실패했습니다.") from None

        try:
            data = response.json()
        except ValueError:
            data = None

        api_error = data.get("ErrorCode") if isinstance(data, dict) else None
        status = response.status_code
        # HTTP 400이나 200으로 전달되는 Bing 오류도 원문 메시지 없이 분류합니다.
        if status == 401 or (type(api_error) is int and api_error == 3):
            raise BingEngineError("authentication", "Bing API 인증을 확인하세요.", status)
        if status == 429 or (type(api_error) is int and api_error in (4, 5)):
            raise BingEngineError("rate_limit", "Bing API 호출 한도를 초과했습니다.", status)
        if status == 403 or (type(api_error) is int and api_error in (6, 13, 14)):
            raise BingEngineError("permission", "Bing 사이트 접근 권한을 확인하세요.", status)
        if status != 200:
            raise BingEngineError("response", "Bing API 요청이 실패했습니다.", status)
        if not isinstance(data, dict) or "d" not in data:
            raise BingEngineError("response", "Bing API 응답 형식이 올바르지 않습니다.", status)
        if "ErrorCode" in data and (type(api_error) is not int or api_error != 0):
            raise BingEngineError("response", "Bing API 오류 응답을 받았습니다.", status)

        # 목록·객체·bool·null의 의미와 필드는 각 기능 메서드에서 검증합니다.
        return data["d"]
