"""로그인봇을 이용한 네이버 서치어드바이저 현황 조회의 진입점입니다."""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import parse_qs, urlencode, urlsplit

from playwright.async_api import Page
from playwright.async_api import TimeoutError as PlaywrightTimeoutError
from pydantic import AnyHttpUrl

from app.login_bot.login_agent import JsonModel, authenticated_page
from app.login_bot.schemas import SessionKey
from app.login_bot.session import SessionStore
from app.login_bot.sites.naver import NaverLoginSite

INSPECTION_URL = "https://searchadvisor.naver.com/console/site/check/inspection"
INSPECTION_MESSAGE = ".v-card__text.primary--text"
INSPECTION_TIMEOUT_MS = 8000
ErrorCode = Literal["invalid_url", "authentication", "navigation", "response"]


class NaverEngineError(Exception):
    """인증정보와 원본 화면을 포함하지 않는 네이버 조회 오류입니다."""

    # 호출자가 구분할 오류 코드와 안전한 메시지를 보관합니다.
    def __init__(self, code: ErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code


# 입력 URL을 정규화하되 인증정보·쿼리·프래그먼트와 공백을 거부합니다.
def _normalize_site_url(value: str) -> str:
    try:
        if not value or any(character.isspace() for character in value) or "\\" in value:
            raise ValueError
        parsed = AnyHttpUrl(value)
        if any(part is not None for part in (parsed.username, parsed.password, parsed.query, parsed.fragment)):
            raise ValueError
        return str(parsed)
    except ValueError:
        raise NaverEngineError("invalid_url", "조회할 사이트의 HTTP(S) URL 형식을 확인하세요.") from None


# 입력한 등록 사이트의 정확한 색인 확인 화면인지 주소와 사이트 매개변수를 검사합니다.
def _is_inspection_url(value: str, site_url: str) -> bool:
    try:
        parsed = urlsplit(value)
        sites = parse_qs(parsed.query).get("site", [])
        return (
            parsed.scheme == "https"
            and parsed.hostname == "searchadvisor.naver.com"
            and parsed.port in (None, 443)
            and parsed.username is None
            and parsed.password is None
            and parsed.path.rstrip("/") == "/console/site/check/inspection"
            and len(sites) == 1
            and _normalize_site_url(sites[0]) == site_url
        )
    except (ValueError, NaverEngineError):
        return False


@dataclass(frozen=True)
class NaverSiteSummary:
    """입력 URL의 색인 확인 시각과 네이버 판정 메시지를 보관합니다."""

    site_url: str
    checked_at: datetime
    text: str = field(repr=False)


@dataclass(frozen=True)
class NaverEngine:
    """로그인 설정을 주입받고 조회하는 동안 동일한 인증 탭을 사용합니다.

    로그인 이후에는 고정 경로와 선택자로 색인 확인을 수행하며 AI를 호출하지 않습니다.
    모델의 HTTP 클라이언트 생성·종료는 호출자가 담당합니다.
    """

    login_site: NaverLoginSite = field(repr=False)
    session_key: SessionKey
    model: JsonModel = field(repr=False)
    store: SessionStore = field(default_factory=SessionStore, repr=False)
    headless: bool = False

    # 로그인된 같은 탭에서 입력 URL의 색인 상태를 확인하고 결과를 반환한 뒤 브라우저를 닫습니다.
    async def get_site_summary(self, site_url: str) -> NaverSiteSummary:
        target_url = _normalize_site_url(site_url)
        async with authenticated_page(
            self.login_site,
            self.session_key,
            model=self.model,
            store=self.store,
            headless=self.headless,
        ) as page:
            await self._open_index_status(page, target_url)
            return await self._read_site_summary(page)

    # 로그인 후 색인 확인 전용 경로로 이동해 URL 입력·확인·결과 대기까지 고정 순서로 실행합니다.
    async def _open_index_status(self, page: Page, site_url: str) -> None:
        target_url = _normalize_site_url(site_url)
        # 네이버 등록 사이트의 루트 주소 키에는 마지막 슬래시를 붙이지 않습니다.
        property_url = target_url[:-1] if urlsplit(target_url).path == "/" else target_url
        destination = INSPECTION_URL + "?" + urlencode({"site": property_url})
        try:
            await page.goto(destination, wait_until="domcontentloaded", timeout=INSPECTION_TIMEOUT_MS)
            # 새 문서가 인증 콜백을 거치는 경우에도 최종 색인 확인 경로까지 기다립니다.
            await page.wait_for_url(
                lambda url: _is_inspection_url(str(url), target_url), timeout=INSPECTION_TIMEOUT_MS,
            )
            url_input = page.locator('input[type="text"]')
            await url_input.wait_for(state="visible", timeout=INSPECTION_TIMEOUT_MS)
            if not _is_inspection_url(page.url, target_url):
                raise NaverEngineError("navigation", "URL 입력 전에 색인 확인 화면이 변경됐습니다.")
            previous_result = page.locator(INSPECTION_MESSAGE).first
            if await previous_result.is_visible() and (await previous_result.inner_text()).strip():
                raise NaverEngineError("response", "이전 판정이 남아 있어 새 조회 결과와 구분할 수 없습니다.")
            await url_input.fill(target_url, timeout=INSPECTION_TIMEOUT_MS)
            await page.get_by_role("button", name="확인", exact=True).click(timeout=INSPECTION_TIMEOUT_MS)
            await page.locator(INSPECTION_MESSAGE).first.wait_for(
                state="visible", timeout=INSPECTION_TIMEOUT_MS,
            )
            await page.wait_for_function(
                "selector => Boolean(document.querySelector(selector)?.innerText.trim())",
                arg=INSPECTION_MESSAGE, timeout=INSPECTION_TIMEOUT_MS,
            )
            if not _is_inspection_url(page.url, target_url):
                raise NaverEngineError("navigation", "판정 결과를 기다리는 동안 화면이 변경됐습니다.")
        except PlaywrightTimeoutError:
            if urlsplit(page.url).hostname == "nid.naver.com":
                raise NaverEngineError("authentication", "색인 확인 화면 진입 중 다시 로그인이 필요합니다.") from None
            raise NaverEngineError("navigation", "색인 확인 화면 또는 조회 결과를 기다리는 시간이 초과됐습니다.") from None

    # 안내·수집 요청 문구와 구분된 첫 번째 판정 메시지를 읽고 UTC 조회 시각을 기록합니다.
    async def _read_site_summary(self, page: Page) -> NaverSiteSummary:
        site_url = _normalize_site_url(await page.locator('input[type="text"]').input_value())
        if not _is_inspection_url(page.url, site_url):
            raise NaverEngineError("navigation", "조회 URL과 현재 색인 확인 화면이 일치하지 않습니다.")
        text = " ".join((await page.locator(INSPECTION_MESSAGE).first.inner_text()).split())
        if not text:
            raise NaverEngineError("response", "네이버의 색인 판정 메시지를 확인하지 못했습니다.")
        return NaverSiteSummary(site_url=site_url, checked_at=datetime.now(timezone.utc), text=text)
