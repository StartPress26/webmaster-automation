"""Google Search Console의 로그인 정책과 화면 상태를 판정합니다."""

import asyncio
import re
from dataclasses import dataclass, field
from typing import ClassVar
from urllib.parse import urlsplit

from playwright.async_api import Error as PlaywrightError
from playwright.async_api import Page

from app.login_bot.schemas import LoginCredentials, LoginPolicy
from app.login_bot.sites.base import SmsChallenge

CONSOLE_URL = "https://search.google.com/search-console"
CREDENTIAL_ERROR = re.compile(
    r"Wrong password|Couldn't find your Google Account|Enter a valid email or phone number"
    r"|비밀번호가 (?:틀렸|잘못)|잘못된 비밀번호|Google 계정을 찾을 수 없"
    r"|올바른 이메일(?: 주소)?(?:이나| 또는) 전화번호를 입력",
    re.IGNORECASE,
)
CONSOLE_MARKER = re.compile(
    r"^(?:Overview|개요|Welcome to Google Search Console"
    r"|Google Search Console에 오신 것을 환영합니다[.!]?)$"
)
ACCOUNT_MENU = (
    'a[href^="https://accounts.google.com/SignOutOptions"], '
    '[aria-label*="Google Account:"], [aria-label*="Google 계정:"]'
)
AUTOMATION_BLOCK = re.compile(
    r"This browser or app may not be secure|이 브라우저 또는 앱은 안전하지 않을 수 있습니다",
    re.IGNORECASE,
)
SMS_SENT = re.compile(
    r"(?:text message|SMS)[^\n]{0,300}\bsent\b"
    r"|\bsent\b[^\n]{0,300}(?:text message|SMS)"
    r"|(?:문자\s*메시지|SMS)[^\n]{0,300}(?:보냈|전송했|발송했|전송되었|발송되었)",
    re.IGNORECASE,
)
SMS_SEND_FAILED = re.compile(
    r"\bnot\b|could(?:n't| not)|unable|failed|전송하지|보내지|발송하지|실패",
    re.IGNORECASE,
)
SMS_CODE_INPUT = 'input[autocomplete="one-time-code"], input[name="idvPin"], input#idvPin'
SMS_CONFIRM_BUTTON = re.compile(r"^(?:Next|Verify|Confirm|다음|확인)$", re.IGNORECASE)
MASKED_PHONE = re.compile(
    r"(?<![\w])(?:\+?\d[\d ()-]{0,10})?[*•●·xX]{2,}"
    r"(?:[ ()-]*[*•●·xX])*[ ()-]*\d{2,4}(?!\d)"
)


GoogleSmsChallenge = SmsChallenge
SMS_CODE_ERROR = re.compile(
    r"Wrong code|Incorrect code|Invalid code|code (?:has )?expired"
    r"|잘못된 (?:인증 )?코드|(?:인증 )?코드가 (?:올바르지|잘못|만료)|코드.*일치하지",
    re.IGNORECASE,
)


# 발송 안내에 명시된 마스킹 번호가 하나일 때만 원문 표시 형태를 반환합니다.
def _masked_phone(text: str) -> str | None:
    matches = tuple(dict.fromkeys(match.group().strip() for match in MASKED_PHONE.finditer(text)))
    return matches[0] if len(matches) == 1 else None


# HTTPS 기본 포트와 인증정보 없는 정확한 호스트의 경로를 반환합니다.
def _path_on_host(url: str, host: str) -> str | None:
    try:
        parsed = urlsplit(url)
        if (
            parsed.scheme == "https"
            and parsed.hostname == host
            and parsed.port in (None, 443)
            and parsed.username is None
            and parsed.password is None
        ):
            return parsed.path.rstrip("/")
    except ValueError:
        pass
    return None


@dataclass(frozen=True)
class GoogleLoginSite:
    """공통 AI 에이전트에 Google 규칙을 제공합니다.

    한국어·영어 화면을 대상으로 하며 선택자는 실제 계정 로그인으로 재검증해야 합니다.
    추가 인증·자동화 차단은 기존 AI의 human 동작으로 호출자에게 넘깁니다.
    """

    credentials: LoginCredentials = field(repr=False)

    _policy: ClassVar[LoginPolicy] = LoginPolicy(
        start_url=CONSOLE_URL,
        allowed_hosts=("search.google.com", "accounts.google.com"),
        goal=(
            "제공된 Google 계정으로 Google Search Console에 로그인합니다. "
            "소개 화면에서는 시작하기를 선택합니다. 계정 선택 시 제공된 계정을 사용합니다. "
            "사이트가 없는 계정의 시작 화면도 로그인 완료입니다. "
            "캡차(CAPTCHA)처럼 현재 화면으로 해결할 수 있는 검증은 직접 수행하세요"
            "화면의 텍스트·이미지를 보고 직접 풀고, 답 입력과 확인까지 수행합니다. "
            "사이트·속성 등록, 소유권 확인, 계정 생성·복구·설정 변경은 하지 않습니다. "
            "추가 인증 방법 중 문자 메시지가 제공되면 문자 인증을 선택하고 코드 발송을 요청합니다. "
            "문자 코드 입력 화면에서는 코드를 추측하거나 재발송하지 말고 wait를 선택합니다. "
            "문자 외 OTP·휴대폰 승인·패스키가 필요하거나 자동화 브라우저 로그인이 차단되면 human을 선택합니다."
        ),
    )

    # 공통 인터페이스에 맞춰 로그인 서비스 식별자를 읽기 전용으로 제공합니다.
    @property
    def name(self) -> str:
        return "google"

    # 클래스가 공유하는 불변 정책을 인스턴스의 읽기 전용 속성으로 제공합니다.
    @property
    def policy(self) -> LoginPolicy:
        return self._policy

    # 콘솔 또는 Google 로그인 화면의 조작 요소가 준비될 때까지 기다립니다.
    async def wait_until_ready(self, page: Page) -> None:
        while True:
            if await self.is_authenticated(page):
                return
            if _path_on_host(page.url, "accounts.google.com") is not None:
                controls = page.locator(
                    'input:not([type="hidden"]), button, [role="button"], [data-identifier]'
                )
                if any([await element.is_visible() for element in await controls.all()]):
                    return
                if any([
                    await element.is_visible()
                    for element in await page.get_by_text(AUTOMATION_BLOCK).all()
                ]):
                    return
            if _path_on_host(page.url, "search.google.com") == "/search-console/about":
                links = page.locator('a[href^="https://accounts.google.com/"]')
                if any([await element.is_visible() for element in await links.all()]):
                    return
            await asyncio.sleep(0.1)

    # 소개 화면을 제외하고 콘솔 안의 계정 메뉴와 화면 표시를 모두 확인합니다.
    async def is_authenticated(self, page: Page) -> bool:
        path = _path_on_host(page.url, "search.google.com")
        if (
            path is None
            or not (path == "/search-console" or path.startswith("/search-console/"))
            or path == "/search-console/about"
        ):
            return False
        has_account = any([
            await element.is_visible() for element in await page.locator(ACCOUNT_MENU).all()
        ])
        return has_account and any([
            await element.is_visible()
            for element in await page.get_by_text(CONSOLE_MARKER).all()
        ])

    # Google 로그인 호스트에서만 표시된 계정 오류를 감지합니다.
    async def credential_error_visible(self, page: Page) -> bool:
        if _path_on_host(page.url, "accounts.google.com") is None:
            return False
        return any([
            await element.is_visible()
            for element in await page.get_by_text(CREDENTIAL_ERROR).all()
        ])

    # 발송 완료 안내·유일한 입력칸·확인 버튼을 함께 확인하고 읽기 전용으로 반환합니다.
    async def detect_sms_challenge(self, page: Page) -> GoogleSmsChallenge | None:
        observed_url = page.url
        # Google 인증 주소인지 확인
        path = _path_on_host(observed_url, "accounts.google.com")
        if path is None or "/challenge/" not in path or "/signin/" not in path:
            return None
        try:
            if any([await item.is_visible() for item in await page.get_by_text(AUTOMATION_BLOCK).all()]):
                return None
            inputs = tuple([
                # input 찾기
                item for item in await page.locator(SMS_CODE_INPUT).all()
                if await item.is_visible() and await item.is_editable()
                and (await item.get_attribute("type") or "text").lower() in ("text", "tel", "number")
            ])
            if len(inputs) != 1:
                return None
            code_input = inputs[0]
            # 현재 입력칸을 포함한 주 영역을 기준으로 안내와 버튼을 찾습니다.
            main = code_input.locator("xpath=ancestor::main[1]")
            # 입력칸을 감싸는 가장 가까운 <main> 안에서 안내와 버튼을 찾아. <main>이 없으면 페이지 본문인 <body>를 사용
            scope = main if await main.count() == 1 else page.locator("body")
            notices = tuple([
                await item.inner_text(timeout=500)
                for item in await scope.get_by_text(SMS_SENT).all()
                if await item.is_visible()
            ])
            sent = tuple(dict.fromkeys(
                text for text in notices if SMS_SENT.search(text) and not SMS_SEND_FAILED.search(text)
            ))
            if len(sent) != 1:
                return None
            buttons = tuple([
                item for item in await scope.get_by_role("button", name=SMS_CONFIRM_BUTTON).all()
                if await item.is_visible() and await item.is_enabled()
            ])
            if len(buttons) != 1 or page.url != observed_url:
                return None
            return GoogleSmsChallenge(
                masked_phone=_masked_phone(sent[0]), code_input=code_input, submit_button=buttons[0]
            )
        except PlaywrightError:
            # 화면 전환으로 관찰이 실패한 경우 인증 화면으로 확정하지 않습니다.
            return None

    # Google 인증 경로에서 보이는 문자 코드 오류만 확인하고 원문은 반환하지 않습니다.
    async def sms_code_error_visible(self, page: Page) -> bool:
        path = _path_on_host(page.url, "accounts.google.com")
        if path is None or "/challenge/" not in path or "/signin/" not in path:
            return False
        return any([
            await item.is_visible() for item in await page.get_by_text(SMS_CODE_ERROR).all()
        ])
