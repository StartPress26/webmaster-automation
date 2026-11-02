"""실제 계정·외부 AI 없이 Google 로그인 규칙과 에이전트 연결을 검증합니다."""

import asyncio
import json
from collections.abc import AsyncIterator

import pytest
from playwright.async_api import Page, Route, async_playwright

from app.login_bot.login_agent import _ensure_login
from app.login_bot.schemas import LoginCredentials
from app.login_bot.sites.base import LoginSite
from app.login_bot.sites.google import CONSOLE_URL, GoogleLoginSite

pytestmark = pytest.mark.anyio
LOGIN_URL = "https://accounts.google.com/v3/signin/identifier"
ACCOUNT = '<button aria-label="Google Account: Test">계정</button>'
SMS_URL = "https://accounts.google.com/v3/signin/challenge/ipp"
SMS_NOTICE = "6자리 인증 코드가 포함된 문자 메시지를 010-****-5523으로 보냈습니다."
SMS_INPUT = '<input id="idvPin" autocomplete="one-time-code" aria-label="코드 입력">'


# 실제 Google 화면의 캡처가 아닌 로컬 문자 인증 예제 화면을 구성합니다.
def sms_html(notice: str = SMS_NOTICE, control: str = SMS_INPUT, button: str = "<button>다음</button>") -> str:
    return f"<main><p>{notice}</p>{control}{button}</main>"


# 프로젝트 비동기 코드와 같은 asyncio 백엔드를 사용합니다.
@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


# 가짜 인증정보만 가진 Google 어댑터를 제공합니다.
@pytest.fixture
def site(monkeypatch: pytest.MonkeyPatch) -> GoogleLoginSite:
    monkeypatch.setattr(
        GoogleLoginSite, "_policy", GoogleLoginSite._policy.model_copy(update={"timeout_seconds": 5.0})
    )
    return GoogleLoginSite(LoginCredentials(login_id="fake-id", password="fake-password"))


# 모든 요청을 로컬 응답으로 대체한 브라우저 탭을 제공합니다.
@pytest.fixture
async def page() -> AsyncIterator[Page]:
    async with async_playwright() as runtime:
        browser = await runtime.chromium.launch(headless=True)
        try:
            context = await browser.new_context()

            # 외부 서버 대신 빈 HTML을 응답합니다.
            async def respond(route: Route) -> None:
                await route.fulfill(content_type="text/html; charset=utf-8", body="<body></body>")

            await context.route("**/*", respond)
            yield await context.new_page()
        finally:
            await browser.close()


class NoCallModel:
    """세션 재사용 중 AI 호출을 거부합니다."""

    # 인증 화면을 기다리는 동안 AI 호출이 발생하면 실패합니다.
    async def complete_json(
        self, system: str, user_text: str, image_data_url: str | None = None
    ) -> dict[str, object]:
        pytest.fail("세션 재사용 중 AI가 호출되었습니다.")


class HumanModel:
    """실제 전송 없이 요청 내용을 확인하고 기존 사용자 인증 종료 동작을 반환합니다."""

    # 인증정보·화면을 받은 뒤 사용자 인증이 필요하다고 응답합니다.
    async def complete_json(
        self, system: str, user_text: str, image_data_url: str | None = None
    ) -> dict[str, object]:
        request = json.loads(user_text)
        assert request["credentials"]["login_id"] == "fake-id"
        assert image_data_url is not None
        return {"action": "human", "reason": "추가 인증 필요"}


class FormModel:
    """화면에 따라 ID·비밀번호 입력과 다음 버튼 클릭을 선택하는 가짜 AI입니다."""

    # 현재 입력칸이 비었으면 채우고 입력 후에는 다음 버튼을 클릭합니다.
    async def complete_json(
        self, system: str, user_text: str, image_data_url: str | None = None
    ) -> dict[str, object]:
        request = json.loads(user_text)
        elements = request["observation"]["elements"]
        for element in elements:
            if element["tag"] == "input" and not element["has_value"]:
                key = "password" if element["type"] == "password" else "login_id"
                return {
                    "action": "fill", "index": element["index"],
                    "text": request["credentials"][key],
                }
        for element in elements:
            if element["label"] == "Next":
                return {"action": "click", "index": element["index"]}
        return {"action": "wait"}


# 공통 계약, 정확한 허용 호스트, 인증정보의 출력 제외를 확인합니다.
async def test_site_contract(site: GoogleLoginSite) -> None:
    contract: LoginSite = site
    assert contract.name == "google"
    assert contract.policy.start_url == CONSOLE_URL
    assert contract.policy.allowed_hosts == ("search.google.com", "accounts.google.com")
    assert "fake-id" not in repr(site)
    assert "fake-password" not in repr(site)


# 콘솔 주소와 계정 메뉴·콘솔 표시가 모두 있어야 인증으로 인정합니다.
@pytest.mark.parametrize(("url", "html", "expected"), [
    (CONSOLE_URL, ACCOUNT + "<h1>개요</h1>", True),
    (CONSOLE_URL + "/", ACCOUNT + "<h1>Overview</h1>", True),
    (CONSOLE_URL + "/welcome", ACCOUNT + "<h1>Welcome to Google Search Console</h1>", True),
    (CONSOLE_URL + "/welcome", ACCOUNT + "<h1>Google Search Console에 오신 것을 환영합니다</h1>", True),
    (CONSOLE_URL, "<h1>Overview</h1>", False),
    (CONSOLE_URL, ACCOUNT, False),
    (CONSOLE_URL, ACCOUNT + "<h1 hidden>Overview</h1>", False),
    (CONSOLE_URL, '<button hidden aria-label="Google Account: Test">계정</button><h1>Overview</h1>', False),
    (CONSOLE_URL + "/about", ACCOUNT + "<h1>Overview</h1>", False),
    ("https://search.google.com/search-console-fake", ACCOUNT + "<h1>Overview</h1>", False),
    (LOGIN_URL, ACCOUNT + "<h1>Overview</h1>", False),
    ("https://search.google.com.evil.test/search-console", ACCOUNT + "<h1>Overview</h1>", False),
])
async def test_authenticated(
    page: Page, site: GoogleLoginSite, url: str, html: str, expected: bool
) -> None:
    await page.goto(url)
    await page.set_content(html)
    assert await site.is_authenticated(page) is expected


# 계정 오류는 Google 로그인 호스트의 표시된 문구만 인정합니다.
@pytest.mark.parametrize(("url", "html", "expected"), [
    (LOGIN_URL, "<p>Wrong password. Try again.</p>", True),
    (LOGIN_URL, "<p>Couldn't find your Google Account</p>", True),
    (LOGIN_URL, "<p>비밀번호가 틀렸습니다. 다시 시도하세요.</p>", True),
    (LOGIN_URL, "<p>Google 계정을 찾을 수 없습니다.</p>", True),
    (LOGIN_URL, "<p hidden>Wrong password</p>", False),
    (LOGIN_URL, "<p>Enter the code</p>", False),
    (LOGIN_URL, "<p>This browser or app may not be secure</p>", False),
    (CONSOLE_URL, "<p>Wrong password</p>", False),
])
async def test_credential_error(
    page: Page, site: GoogleLoginSite, url: str, html: str, expected: bool
) -> None:
    await page.goto(url)
    await page.set_content(html)
    assert await site.credential_error_visible(page) is expected


# 다단계 입력·계정 선택·추가 인증·자동화 차단·소개 화면을 AI에 넘길 수 있습니다.
@pytest.mark.parametrize(("url", "html"), [
    (LOGIN_URL, '<input type="email">'),
    (LOGIN_URL, '<input type="password">'),
    (LOGIN_URL, '<div data-identifier="fake-id">계정 선택</div>'),
    (LOGIN_URL, '<input autocomplete="one-time-code">'),
    (LOGIN_URL, '<p>This browser or app may not be secure</p>'),
    (CONSOLE_URL + "/about", '<a href="https://accounts.google.com/ServiceLogin">시작하기</a>'),
])
async def test_ready_for_ai(page: Page, site: GoogleLoginSite, url: str, html: str) -> None:
    await page.goto(url)
    await page.set_content(html)
    async with asyncio.timeout(2):
        await site.wait_until_ready(page)


# 지연 렌더링된 콘솔도 AI 호출 없이 인증으로 판정합니다.
async def test_delayed_console_skips_ai(page: Page, site: GoogleLoginSite) -> None:
    # 콘솔 응답이 늦게 계정 메뉴와 제목을 표시하도록 합니다.
    async def respond(route: Route) -> None:
        await route.fulfill(content_type="text/html; charset=utf-8", body=f"""
            <body><script>setTimeout(() => {{
                document.body.innerHTML = '{ACCOUNT}<h1>Overview</h1>';
            }}, 400);</script></body>
        """)

    await page.route(CONSOLE_URL, respond)
    assert (await _ensure_login(page, site, NoCallModel())).status == "authenticated"


# Google 로그인으로 리다이렉트된 뒤 기존 human 종료 동작을 유지합니다.
async def test_login_redirect_requires_user(page: Page, site: GoogleLoginSite) -> None:
    # 콘솔 접속을 Google 로그인 화면으로 이동시킵니다.
    async def redirect(route: Route) -> None:
        await route.fulfill(
            content_type="text/html", body=f'<script>location.href = "{LOGIN_URL}";</script>'
        )

    # 추가 인증 화면을 로컬 HTML로 제공합니다.
    async def challenge(route: Route) -> None:
        await route.fulfill(content_type="text/html", body='<input autocomplete="one-time-code">')

    await page.route(CONSOLE_URL, redirect)
    await page.route(LOGIN_URL, challenge)
    result = await _ensure_login(page, site, HumanModel())
    assert result.status == "requires_user"


# 공통 에이전트로 ID 입력 다음 비밀번호 입력을 거쳐 콘솔 복귀를 확인합니다.
async def test_multistep_login(page: Page, site: GoogleLoginSite) -> None:
    # 첫 콘솔 요청은 로그인으로 보내고 로그인 뒤 콘솔 화면을 제공합니다.
    async def console(route: Route) -> None:
        if "done=1" in route.request.url:
            await route.fulfill(
                content_type="text/html; charset=utf-8", body=ACCOUNT + "<h1>Overview</h1>"
            )
        else:
            await route.fulfill(
                content_type="text/html", body=f'<script>location.href = "{LOGIN_URL}";</script>'
            )

    # 외부 요청 없이 두 단계 양식과 콘솔 복귀를 구현합니다.
    async def signin(route: Route) -> None:
        await route.fulfill(content_type="text/html", body=f"""
            <form method="post"><input aria-label="Email" autocomplete="username">
            <button>Next</button></form>
            <script>document.querySelector('form').onsubmit = event => {{
                event.preventDefault();
                if (document.querySelector('input').value !== 'fake-id') return;
                document.body.innerHTML = '<form method="post"><input type="password"><button>Next</button></form>';
                document.querySelector('form').onsubmit = event => {{
                    event.preventDefault();
                    if (document.querySelector('input').value === 'fake-password')
                        location.href = '{CONSOLE_URL}?done=1';
                }};
            }};</script>
        """)

    await page.route(CONSOLE_URL + "*", console)
    await page.route(LOGIN_URL, signin)
    result = await _ensure_login(page, site, FormModel())
    assert result.status == "authenticated"
    assert result.login_attempts == 2


# 한·영 문자 발송 완료 안내와 입력 요소를 확인하며 화면을 변경하지 않습니다.
@pytest.mark.parametrize(("notice", "phone", "button"), [
    (SMS_NOTICE, "010-****-5523", "다음"),
    ("인증 코드가 포함된 문자 메시지가 010-****-5523 번호로 전송되었습니다.", "010-****-5523", "확인"),
    ("A text message with a 6-digit verification code was just sent to ••• ••• ••23.", "••• ••• ••23", "Next"),
    ("We sent a text message to +82 10-****-5523.", "+82 10-****-5523", "Verify"),
    ("A text message was sent to your phone.", None, "Confirm"),
    ("문자 메시지를 010-1234-5523으로 보냈습니다.", None, "다음"),
])
async def test_detect_sms_challenge(
    page: Page, site: GoogleLoginSite, notice: str, phone: str | None, button: str
) -> None:
    await page.goto(SMS_URL)
    await page.set_content(sms_html(notice, button=f'<button onclick="document.body.dataset.clicked=1">{button}</button>'))
    challenge = await site.detect_sms_challenge(page)
    assert challenge is not None
    assert challenge.masked_phone == phone
    assert await challenge.code_input.get_attribute("id") == "idvPin"
    assert await challenge.submit_button.inner_text() == button
    assert await challenge.code_input.input_value() == ""
    assert await page.locator("body").get_attribute("data-clicked") is None
    assert "010-1234-5523" not in repr(challenge)


# 정상 안내가 있어도 잘못된 출처나 인증 경로가 아니면 거부합니다.
@pytest.mark.parametrize("url", [
    CONSOLE_URL, LOGIN_URL, "http://accounts.google.com/v3/signin/challenge/ipp",
    "https://accounts.google.com.evil.test/v3/signin/challenge/ipp",
    "https://accounts.google.com:444/v3/signin/challenge/ipp",
])
async def test_sms_rejects_wrong_location(page: Page, site: GoogleLoginSite, url: str) -> None:
    await page.goto(url)
    await page.set_content(sms_html())
    assert await site.detect_sms_challenge(page) is None


# OTP 입력칸만으로 문자 인증을 추정하거나 미발송·다른 인증 수단을 오인하지 않습니다.
@pytest.mark.parametrize("notice", [
    "", "문자 메시지 보내기", "Send a text message to 010-****-5523",
    "Google Authenticator 앱의 코드를 입력하세요.", "휴대전화에서 예를 탭하세요.",
    "A verification code was sent to your email.",
    "A text message was not sent. Try again.", "문자 메시지 전송에 실패했습니다.",
])
async def test_sms_rejects_unconfirmed_delivery(page: Page, site: GoogleLoginSite, notice: str) -> None:
    await page.goto(SMS_URL)
    await page.set_content(sms_html(notice))
    assert await site.detect_sms_challenge(page) is None


# 숨겨진 안내·입력칸과 모호하거나 조작 불가능한 요소는 반환하지 않습니다.
@pytest.mark.parametrize("html", [
    f'<main><p hidden>{SMS_NOTICE}</p>{SMS_INPUT}<button>다음</button></main>',
    sms_html(control='<input id="idvPin" hidden>'),
    sms_html(control='<input id="idvPin" disabled>'),
    sms_html(control='<input id="idvPin" readonly>'),
    sms_html(control='<input id="idvPin" type="password">'),
    sms_html(control=SMS_INPUT + '<input autocomplete="one-time-code">'),
    sms_html(button='<button disabled>다음</button>'),
    sms_html(button='<button hidden>다음</button>'),
    sms_html(button='<button>다음</button><button>확인</button>'),
    sms_html(button='<button>코드 재전송</button>'),
    sms_html() + '<p>This browser or app may not be secure</p>',
])
async def test_sms_rejects_unusable_screen(page: Page, site: GoogleLoginSite, html: str) -> None:
    await page.goto(SMS_URL)
    await page.set_content(html)
    assert await site.detect_sms_challenge(page) is None


# 숨겨진 이전 입력칸은 무시하되 표시된 코드 원문은 결과에 포함하지 않습니다.
async def test_sms_hidden_old_controls_and_value(page: Page, site: GoogleLoginSite) -> None:
    await page.goto(SMS_URL)
    await page.set_content(sms_html(control=SMS_INPUT + '<input autocomplete="one-time-code" hidden>'))
    await page.locator("#idvPin").fill("654321")
    challenge = await site.detect_sms_challenge(page)
    assert challenge is not None
    assert "654321" not in repr(challenge)
    assert await challenge.code_input.input_value() == "654321"


# 안내에서 번호를 특정할 수 없으면 번호를 추측하지 않습니다.
async def test_sms_ambiguous_phone(page: Page, site: GoogleLoginSite) -> None:
    await page.goto(SMS_URL)
    await page.set_content(sms_html("문자 메시지를 010-****-5523 또는 010-****-1122로 보냈습니다."))
    challenge = await site.detect_sms_challenge(page)
    assert challenge is not None
    assert challenge.masked_phone is None


# 입력칸과 다른 주 영역의 문자 안내를 현재 인증 요청으로 사용하지 않습니다.
async def test_sms_notice_outside_current_main(page: Page, site: GoogleLoginSite) -> None:
    await page.goto(SMS_URL)
    await page.set_content(f"<aside>{SMS_NOTICE}</aside><main>{SMS_INPUT}<button>다음</button></main>")
    assert await site.detect_sms_challenge(page) is None
