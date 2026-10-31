"""실제 AI·사이트 없이 계정 변수 전달과 화면 기반 로그인 루프를 검증합니다."""

import json
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

import pytest
from playwright.async_api import Page, Route, async_playwright

from app.login_bot.login_agent import _execute_action, _observe_page, _run_login
from app.login_bot.schemas import LOGIN_ACTION, LoginCredentials, LoginPolicy

HOST = "login.example.test"
URL = f"https://{HOST}/login"
pytestmark = pytest.mark.anyio


# 테스트에서 asyncio만 사용합니다.
@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


# 모든 네트워크 요청에 로컬 문서를 응답하는 작업 탭을 제공합니다.
@pytest.fixture
async def page() -> AsyncIterator[Page]:
    async with async_playwright() as runtime:
        browser = await runtime.chromium.launch(headless=True)
        try:
            context = await browser.new_context()

            # 외부 접속 없이 빈 HTML을 응답합니다.
            async def respond(route: Route) -> None:
                await route.fulfill(status=200, content_type="text/html", body="<body></body>")

            await context.route("**/*", respond)
            page = await context.new_page()
            await page.goto(URL)
            yield page
        finally:
            await browser.close()


@dataclass(frozen=True)
class FakeSite:
    """완료 표시로 인증을 판정하는 사이트 규칙입니다."""

    name: str = "fake"
    policy: LoginPolicy = field(default_factory=lambda: LoginPolicy(
        start_url=URL, allowed_hosts=(HOST,), goal="로그인", max_steps=6,
    ))
    credentials: LoginCredentials = field(default_factory=lambda: LoginCredentials(
        login_id="private-id", password="private-password",
    ), repr=False)

    # 초기 화면의 로그인 조작 요소 또는 인증 완료 표시를 기다립니다.
    async def wait_until_ready(self, page: Page) -> None:
        await page.locator("input, button, #authenticated").first.wait_for(state="visible")

    # 로컬 완료 표시가 보이면 인증 성공입니다.
    async def is_authenticated(self, page: Page) -> bool:
        return await page.locator("#authenticated").is_visible()

    # 로컬 계정 오류 표시가 보이면 인증정보가 잘못된 상태입니다.
    async def credential_error_visible(self, page: Page) -> bool:
        return await page.locator("#credential-error").is_visible()


@dataclass
class ScriptModel:
    """정해진 행동을 반환하고 전달된 요청을 테스트 메모리에만 보관합니다."""

    actions: tuple[dict[str, object], ...]
    requests: list[dict[str, object]] = field(default_factory=list, repr=False)

    # 화면 이미지와 계정 변수를 받는지 확인하고 다음 행동을 반환합니다.
    async def complete_json(
        self, system: str, user_text: str, image_data_url: str | None = None,
    ) -> dict[str, object]:
        assert image_data_url and image_data_url.startswith("data:image/jpeg;base64,")
        request = json.loads(user_text)
        assert request["credentials"] == {"login_id": "private-id", "password": "private-password"}
        assert "private-password" not in json.dumps(request["history"])
        self.requests.append(request)
        return self.actions[min(len(self.requests) - 1, len(self.actions) - 1)]


# AI가 ID·비밀번호 입력과 제출, 캡차 입력과 확인까지 선택하고 마지막 행동 뒤 성공하는지 확인합니다.
async def test_ai_login_and_captcha(page: Page) -> None:
    await page.set_content('''<form method="post"><input aria-label="아이디" autocomplete="username">
        <input aria-label="비밀번호" type="password"><button>로그인</button></form>
        <script>document.querySelector('form').onsubmit = event => {
            event.preventDefault();
            document.body.innerHTML = '<input aria-label="캡차"><button>확인</button>';
            document.querySelector('button').onclick = () => {
                if (document.querySelector('input').value === 'test-answer')
                    document.body.innerHTML = '<h1 id="authenticated">완료</h1>';
            };
        };</script>''')
    model = ScriptModel(actions=(
        {"action": "fill", "index": 0, "text": "private-id"},
        {"action": "fill", "index": 1, "text": "private-password"},
        {"action": "click", "index": 2},
        {"action": "fill", "index": 0, "text": "test-answer"},
        {"action": "click", "index": 1},
    ))
    site = FakeSite(policy=LoginPolicy(start_url=URL, allowed_hosts=(HOST,), goal="로그인", max_steps=5))
    result = await _run_login(page, site, model)
    assert result.status == "authenticated"
    assert result.login_attempts == 1
    assert len(model.requests) == 5


# 로그인된 화면에서는 인증정보를 AI에 보내지 않는지 확인합니다.
async def test_authenticated_skips_model(page: Page) -> None:
    await page.set_content('<h1 id="authenticated">완료</h1>')
    model = ScriptModel(actions=({"action": "wait"},))
    assert (await _run_login(page, FakeSite(), model)).status == "authenticated"
    assert model.requests == []


# AI가 인증값을 종료 사유에 포함해도 호출자에게 전달하지 않는지 확인합니다.
async def test_human_reason_hides_secrets(page: Page) -> None:
    model = ScriptModel(actions=({"action": "human", "reason": "private-password"},))
    result = await _run_login(page, FakeSite(), model)
    assert result.status == "requires_user"
    assert "private-password" not in repr(result)


# 계정 오류는 추가 AI 호출 없이 사용자에게 넘기는지 확인합니다.
async def test_credential_error_stops(page: Page) -> None:
    await page.set_content('<p id="credential-error">오류</p>')
    model = ScriptModel(actions=({"action": "wait"},))
    assert (await _run_login(page, FakeSite(), model)).status == "requires_user"
    assert model.requests == []


# 계속 실패하는 폼은 정해진 시도 횟수까지만 제출하는지 확인합니다.
async def test_attempt_limit(page: Page) -> None:
    await page.set_content('<form method="post" onsubmit="event.preventDefault()"><input type="password"><button>로그인</button></form>')
    model = ScriptModel(actions=({"action": "click", "index": 1},))
    site = FakeSite(policy=LoginPolicy(start_url=URL, allowed_hosts=(HOST,), goal="로그인", max_login_attempts=1))
    result = await _run_login(page, site, model)
    assert result.status == "failed"
    assert result.login_attempts == 1
    assert len(model.requests) == 2


# 모델의 잘못된 행동도 정해진 횟수 뒤 안전한 실패로 끝나는지 확인합니다.
async def test_invalid_action_limit(page: Page) -> None:
    model = ScriptModel(actions=({"action": "arbitrary-code", "text": "private-password"},))
    result = await _run_login(page, FakeSite(), model)
    assert result.status == "failed"
    assert result.steps == 6
    assert "private-password" not in repr(result)


# 외부 전송 폼은 인증정보 입력 전에 차단하고 분리된 과거 요소도 거부하는지 확인합니다.
@pytest.mark.parametrize("form", [
    '<form action="https://evil.example/" method="post"><input type="password"></form>',
    '<form method="get"><input type="password"></form>',
])
async def test_blocks_external_form_and_stale_elements(page: Page, form: str) -> None:
    await page.set_content(form)
    _, elements = await _observe_page(page)
    action = LOGIN_ACTION.validate_python({"action": "fill", "index": 0, "text": "private-password"})
    with pytest.raises(ValueError):
        await _execute_action(page, action, elements, FakeSite().policy)
    assert await page.locator("input").input_value() == ""
    await page.set_content('<input type="password">')
    with pytest.raises(ValueError):
        await _execute_action(page, action, elements, FakeSite().policy)
