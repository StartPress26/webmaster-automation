"""실제 Google·Discord·AI 호출 없이 동일 탭의 문자 인증 대기·재개를 검증합니다."""

import asyncio
from collections.abc import AsyncIterator
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from playwright.async_api import Browser, BrowserContext, Page, Route, StorageState, async_playwright

from app.login_bot import login_agent
from app.login_bot.human_auth import AuthCode, SmsCodeProvider
from app.login_bot.login_agent import LoginError, _ensure_login, authenticated_page
from app.login_bot.schemas import LoginCredentials, SessionKey
from app.login_bot.session import SessionStore
from app.login_bot.sites.google import CONSOLE_URL, GoogleLoginSite

pytestmark = pytest.mark.anyio
SMS_URL = "https://accounts.google.com/v3/signin/challenge/ipp"
NOTICE = "문자 메시지를 010-****-5523으로 보냈습니다."
CONSOLE = '<button aria-label="Google Account: Test">계정</button><h1>Overview</h1>'
SMS_HTML = f"""<main><p>{NOTICE}</p><form method="post" action="{SMS_URL}">
<input id="idvPin" autocomplete="one-time-code"><button>Next</button></form></main>
<script>document.querySelector('form').onsubmit = event => {{
    event.preventDefault();
    if (document.querySelector('input').value === '123456') {{
        document.cookie = 'sms_auth=1; Secure; SameSite=Lax';
        location.href = '{CONSOLE_URL}';
    }} else {{
        document.querySelector('main').insertAdjacentHTML('beforeend', '<p>Wrong code. Try again.</p>');
    }}
}};</script>"""


# Playwright와 동일한 asyncio 백엔드를 사용합니다.
@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


# 사이트·AI·Discord를 실제로 호출하지 않는 짧은 정책을 구성합니다.
@pytest.fixture
def site(monkeypatch: pytest.MonkeyPatch) -> GoogleLoginSite:
    monkeypatch.setattr(GoogleLoginSite, "_policy", GoogleLoginSite._policy.model_copy(update={
        "start_url": SMS_URL, "timeout_seconds": 5.0, "human_timeout_seconds": 1.0,
    }))
    return GoogleLoginSite(LoginCredentials(login_id="fake-id", password="fake-password"))


# 모든 요청에 로컬 인증 화면 또는 콘솔을 응답합니다.
async def local_response(route: Route) -> None:
    await route.fulfill(
        content_type="text/html; charset=utf-8",
        body=CONSOLE if route.request.url.startswith(CONSOLE_URL) else SMS_HTML,
    )


# 네트워크를 모두 가로챈 Chromium 탭을 제공합니다.
@pytest.fixture
async def page() -> AsyncIterator[Page]:
    async with async_playwright() as runtime:
        browser = await runtime.chromium.launch(headless=True)
        try:
            context = await browser.new_context()
            await context.route("**/*", local_response)
            yield await context.new_page()
        finally:
            await browser.close()


# 문자 인증 이후 AI 요청이 발생하면 즉시 실패합니다.
@pytest.fixture
def model() -> MagicMock:
    fake = MagicMock()
    fake.complete_json = AsyncMock(side_effect=AssertionError("문자 인증 화면을 AI에 보내면 안 됩니다."))
    return fake


# 실제 Discord 대신 코드 요청 인자와 호출 횟수를 검사합니다.
@pytest.fixture
def provider() -> MagicMock:
    fake = MagicMock(spec=SmsCodeProvider)
    fake.request_code = AsyncMock(return_value=AuthCode("123456"))
    return fake


# 같은 Page에서 코드 요청·직접 입력·최종 인증까지 완료하며 AI는 호출하지 않습니다.
async def test_sms_success(page: Page, site: GoogleLoginSite, provider: MagicMock, model: MagicMock) -> None:
    result = await _ensure_login(page, site, model, sms_provider=provider)
    assert result.status == "authenticated"
    assert page.url == CONSOLE_URL
    assert not page.is_closed()
    provider.request_code.assert_awaited_once_with(service="google", masked_phone="010-****-5523", timeout_seconds=1.0)
    model.complete_json.assert_not_called()


# 제공자가 없으면 화면을 AI에 보내지 않고 기존 사용자 개입 결과로 종료합니다.
async def test_sms_without_provider(page: Page, site: GoogleLoginSite, model: MagicMock) -> None:
    result = await _ensure_login(page, site, model)
    assert result.status == "requires_user"
    model.complete_json.assert_not_called()


# 오답·만료·잘못된 형식·연결 오류 모두 재발송이나 AI 재진입 없이 종료합니다.
@pytest.mark.parametrize("case", ["wrong", "none", "invalid", "provider_error", "expired"])
async def test_sms_failures(
    page: Page, site: GoogleLoginSite, provider: MagicMock, model: MagicMock, case: str
) -> None:
    if case == "provider_error":
        provider.request_code.side_effect = RuntimeError("secret-provider-value")
    elif case == "expired":
        provider.request_code.side_effect = TimeoutError
    else:
        provider.request_code.return_value = {"wrong": AuthCode("654321"), "none": None, "invalid": AuthCode("bad-secret")}[case]
    result = await _ensure_login(page, site, model, sms_provider=provider)
    assert result.status in ("requires_user", "failed")
    assert "654321" not in repr(result)
    assert "secret" not in repr(result)
    provider.request_code.assert_awaited_once()
    model.complete_json.assert_not_called()


# 기다리는 동안 화면·번호·요소가 변경되면 받은 코드를 사용하지 않습니다.
@pytest.mark.parametrize("change", ["url", "phone", "replace"])
async def test_sms_stale_screen(
    page: Page, site: GoogleLoginSite, provider: MagicMock, model: MagicMock, change: str
) -> None:
    # 사용자 대기 중 일어난 화면 변경을 재현합니다.
    async def reply(**kwargs: object) -> AuthCode:
        if change == "url":
            await page.goto(SMS_URL + "?new=1")
        elif change == "phone":
            await page.locator("main > p").evaluate("el => el.textContent = '문자 메시지를 010-****-1122로 보냈습니다.'")
        else:
            await page.locator("#idvPin").evaluate("el => el.replaceWith(el.cloneNode(true))")
        return AuthCode("123456")

    provider.request_code.side_effect = reply
    result = await _ensure_login(page, site, model, sms_provider=provider)
    assert result.status == "requires_user"
    assert await page.locator("#idvPin").input_value() == ""
    model.complete_json.assert_not_called()


# GET 폼·외부 목적지·버튼 전송 대상 변경은 OTP 요청 전에 차단합니다.
@pytest.mark.parametrize("attribute", [
    'method="get"', 'method="post" action="https://evil.test/"',
])
async def test_sms_unsafe_form(
    page: Page, site: GoogleLoginSite, provider: MagicMock, model: MagicMock, attribute: str
) -> None:
    # 인증 폼의 목적지나 방식을 바꾼 로컬 응답을 제공합니다.
    async def unsafe(route: Route) -> None:
        await route.fulfill(content_type="text/html; charset=utf-8", body=f'<main><p>{NOTICE}</p><form {attribute}><input id="idvPin"><button>Next</button></form></main>')

    await page.route(SMS_URL, unsafe)
    result = await _ensure_login(page, site, model, sms_provider=provider)
    assert result.status == "failed"
    provider.request_code.assert_not_called()
    model.complete_json.assert_not_called()


# 폼 목적지가 사용자 대기 중 변경돼도 입력 전에 다시 검사합니다.
async def test_sms_form_changed_during_wait(page: Page, site: GoogleLoginSite, provider: MagicMock, model: MagicMock) -> None:
    # 코드 도착 직전에 제출 버튼의 목적지를 외부로 변경합니다.
    async def reply(**kwargs: object) -> AuthCode:
        await page.locator("button").evaluate("el => el.setAttribute('formaction', 'https://evil.test/')")
        return AuthCode("123456")

    provider.request_code.side_effect = reply
    result = await _ensure_login(page, site, model, sms_provider=provider)
    assert result.status == "failed"
    assert await page.locator("#idvPin").input_value() == ""
    model.complete_json.assert_not_called()


# 사용자 대기 시간이 자동 조작 제한보다 길어도 별도 예산 안에서는 성공합니다.
async def test_sms_wait_has_separate_budget(
    page: Page, site: GoogleLoginSite, provider: MagicMock, model: MagicMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(GoogleLoginSite, "_policy", site.policy.model_copy(update={"timeout_seconds": 1.5, "human_timeout_seconds": 4.0}))

    # 자동 조작 예산보다 오래 기다렸다가 코드를 돌려줍니다.
    async def reply(**kwargs: object) -> AuthCode:
        await asyncio.sleep(1.7)
        assert not page.is_closed()
        return AuthCode("123456")

    provider.request_code.side_effect = reply
    assert (await _ensure_login(page, site, model, sms_provider=provider)).status == "authenticated"


# 응답 없는 제공자는 사용자 대기 제한으로 취소됩니다.
async def test_sms_wait_timeout(
    page: Page, site: GoogleLoginSite, provider: MagicMock, model: MagicMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(GoogleLoginSite, "_policy", site.policy.model_copy(update={"human_timeout_seconds": 0.01}))
    cancelled = asyncio.Event()

    # 영구 대기를 재현하고 호출자의 취소가 전달되는지 확인합니다.
    async def reply(**kwargs: object) -> AuthCode:
        try:
            await asyncio.Event().wait()
            return AuthCode("123456")
        finally:
            cancelled.set()

    provider.request_code.side_effect = reply
    result = await _ensure_login(page, site, model, sms_provider=provider)
    assert result.status == "requires_user"
    assert cancelled.is_set()
    model.complete_json.assert_not_called()


# 제출 이후에도 인증 성공이 확인되지 않으면 성공으로 저장하지 않습니다.
async def test_sms_unconfirmed_result(
    page: Page, site: GoogleLoginSite, provider: MagicMock, model: MagicMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(login_agent, "SMS_RESULT_TIMEOUT_SECONDS", 0.05)

    # 폼 제출 후 아무 결과도 표시하지 않는 화면을 재현합니다.
    async def reply(**kwargs: object) -> AuthCode:
        await page.locator("form").evaluate("el => el.onsubmit = event => event.preventDefault()")
        return AuthCode("123456")

    provider.request_code.side_effect = reply
    result = await _ensure_login(page, site, model, sms_provider=provider)
    assert result.status == "requires_user"
    model.complete_json.assert_not_called()


# 제품 진입점에서도 성공 시에만 세션을 저장하고 항상 브라우저를 닫습니다.
@pytest.mark.parametrize("succeeds", [True, False])
async def test_sms_authenticated_page_saves_session(
    site: GoogleLoginSite, provider: MagicMock, model: MagicMock, monkeypatch: pytest.MonkeyPatch, tmp_path: Path,
    succeeds: bool,
) -> None:
    original = login_agent._new_context

    # 제품 브라우저 컨텍스트의 외부 요청을 모두 로컬 응답으로 대체합니다.
    async def local_context(browser: Browser, state: StorageState | None) -> BrowserContext:
        context = await original(browser, state)
        await context.route("**/*", local_response)
        return context

    monkeypatch.setattr(login_agent, "_new_context", local_context)
    store = SessionStore(root_dir=tmp_path / "sessions")
    key = SessionKey(site="google", account_id="sms_test")
    if not succeeds:
        provider.request_code.return_value = AuthCode("654321")
        with pytest.raises(LoginError):
            async with authenticated_page(site, key, model=model, store=store, headless=True, sms_provider=provider):
                pytest.fail("오답인데 인증된 Page가 제공되었습니다.")
        assert store.load(key) is None
        return
    async with authenticated_page(site, key, model=model, store=store, headless=True, sms_provider=provider) as tab:
        assert await site.is_authenticated(tab)
    assert tab.is_closed()
    saved = store.load(key)
    assert saved is not None
    assert any(cookie["name"] == "sms_auth" for cookie in saved["cookies"])


# AI가 문자 방식 선택을 누른 뒤 다음 반복부터 Discord 분기로 전환됩니다.
async def test_ai_selection_then_sms(page: Page, site: GoogleLoginSite, provider: MagicMock, model: MagicMock, monkeypatch: pytest.MonkeyPatch) -> None:
    choice_url = "https://accounts.google.com/v3/signin/challenge/selection"
    monkeypatch.setattr(GoogleLoginSite, "_policy", site.policy.model_copy(update={"start_url": choice_url}))

    # 문자 발송 선택 버튼만 있는 인증 방식 선택 화면을 제공합니다.
    async def selection(route: Route) -> None:
        await route.fulfill(content_type="text/html; charset=utf-8", body=f'<button onclick="location.href=\'{SMS_URL}\'">문자 메시지 보내기</button>')

    await page.route(choice_url, selection)
    model.complete_json.side_effect = None
    model.complete_json.return_value = {"action": "click", "index": 0}
    result = await _ensure_login(page, site, model, sms_provider=provider)
    assert result.status == "authenticated"
    model.complete_json.assert_awaited_once()
    provider.request_code.assert_awaited_once()


# 코드 입력 이벤트가 버튼을 바꾸면 제출하지 않고 AI 재관찰 없이 종료합니다.
async def test_screen_changes_after_code_fill(page: Page, site: GoogleLoginSite, provider: MagicMock, model: MagicMock) -> None:
    # 실제 코드를 받은 뒤 fill 이벤트에서 화면이 바뀌도록 준비합니다.
    async def reply(**kwargs: object) -> AuthCode:
        await page.locator("#idvPin").evaluate("""el => el.oninput = () => {
            const button = document.querySelector('button');
            button.replaceWith(button.cloneNode(true));
        }""")
        return AuthCode("123456")

    provider.request_code.side_effect = reply
    result = await _ensure_login(page, site, model, sms_provider=provider)
    assert result.status == "requires_user"
    assert await page.locator("#idvPin").input_value() == "123456"
    model.complete_json.assert_not_called()


# 대기 중 호출자를 취소하면 제공자와 브라우저를 닫고 세션을 저장하지 않습니다.
async def test_cancel_sms_closes_browser(
    site: GoogleLoginSite, provider: MagicMock, model: MagicMock, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    original = login_agent._new_context
    captured = MagicMock()
    entered = asyncio.Event()
    cancelled = asyncio.Event()

    # 실제 생성된 컨텍스트를 기록하고 외부 요청을 차단합니다.
    async def local_context(browser: Browser, state: StorageState | None) -> BrowserContext:
        context = await original(browser, state)
        await context.route("**/*", local_response)
        captured(context)
        return context

    # 취소될 때까지 응답하지 않는 사용자 대기를 재현합니다.
    async def reply(**kwargs: object) -> AuthCode:
        entered.set()
        try:
            await asyncio.Event().wait()
            return AuthCode("123456")
        finally:
            cancelled.set()

    monkeypatch.setattr(login_agent, "_new_context", local_context)
    provider.request_code.side_effect = reply
    store = SessionStore(root_dir=tmp_path / "sessions")
    key = SessionKey(site="google", account_id="cancel_test")

    # 제품 컨텍스트를 열어 인증 성공 전에 취소되는 상황을 확인합니다.
    async def login() -> None:
        async with authenticated_page(site, key, model=model, store=store, headless=True, sms_provider=provider):
            pytest.fail("취소된 로그인에서 Page가 제공되었습니다.")

    async with asyncio.TaskGroup() as tasks:
        task = tasks.create_task(login())
        await asyncio.wait_for(entered.wait(), timeout=5)
        tab = captured.call_args.args[0].pages[0]
        task.cancel()
    assert task.cancelled() and cancelled.is_set()
    assert tab.is_closed()
    assert store.load(key) is None
