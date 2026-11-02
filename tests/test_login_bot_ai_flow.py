"""실제 AI·사이트 없이 계정 변수 전달과 화면 기반 로그인 루프를 검증합니다."""

import json
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from unittest.mock import AsyncMock

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


# 화면 밖 첫 링크를 제외하고 본문 링크의 요소 번호를 다시 맞춥니다.
async def test_observation_excludes_offscreen_start_link(page: Page) -> None:
    await page.set_viewport_size({"width": 800, "height": 600})
    await page.set_content('''
        <a id="outside" href="/next" style="position:fixed;left:900px;top:20px">시작하기</a>
        <a id="inside" href="/next" style="position:absolute;left:20px;top:100px">시작하기</a>
    ''')
    assert await page.locator("#outside").is_visible()
    observation, elements = await _observe_page(page)
    assert len(elements) == 1
    assert await elements[0].get_attribute("id") == "inside"
    assert observation["elements"][0]["index"] == 0
    assert observation["elements"][0]["label"] == "시작하기"


# 네 방향 화면 밖과 경계선 접촉은 제외하고 일부라도 겹치면 포함합니다.
@pytest.mark.parametrize(("left", "top", "expected"), [
    (800, 20, False), (-100, 20, False), (20, 600, False), (20, -40, False),
    (790, 20, True), (-90, 20, True), (20, 590, True), (20, -30, True),
])
async def test_observation_viewport_edges(page: Page, left: int, top: int, expected: bool) -> None:
    await page.set_viewport_size({"width": 800, "height": 600})
    await page.set_content(f'''<style>html,body{{margin:0;overflow:hidden}}</style>
        <button style="position:fixed;left:{left}px;top:{top}px;width:100px;height:40px">확인</button>''')
    _, elements = await _observe_page(page)
    assert bool(elements) is expected


# 스크롤로 화면 안에 들어온 요소는 다음 관찰에서 후보가 됩니다.
async def test_observation_includes_control_after_scroll(page: Page) -> None:
    await page.set_viewport_size({"width": 800, "height": 600})
    await page.set_content('''<body style="margin:0;height:1600px">
        <button id="below" style="position:absolute;top:1000px">다음</button></body>''')
    assert await page.locator("#below").is_visible()
    assert (await _observe_page(page))[1] == ()
    await page.evaluate("window.scrollTo(0, 800)")
    observation, elements = await _observe_page(page)
    assert len(elements) == 1
    assert observation["elements"][0]["label"] == "다음"


# 화면 안에 배치되어도 숨겨진 요소는 기존처럼 제외합니다.
async def test_observation_keeps_hidden_controls_excluded(page: Page) -> None:
    await page.set_content('''<button hidden>숨김</button>
        <button style="visibility:hidden">숨김</button><button>표시</button>''')
    observation, elements = await _observe_page(page)
    assert len(elements) == 1
    assert observation["elements"][0]["label"] == "표시"


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
    assert len(model.requests[3]["history"]) == 3
    assert model.requests[3]["history"][0]["target_label"] == "아이디"
    assert model.requests[4]["history"][-1] == {
        "action": "fill", "outcome": "실행 완료", "target_index": "0",
        "target_label": "캡차", "target_type": "input", "input_state": "입력값 있음",
    }
    histories = json.dumps([request["history"] for request in model.requests])
    assert "test-answer" not in histories
    assert "private-id" not in histories
    assert "private-password" not in histories


# 입력 후 버튼이 나타나 요소 번호가 달라져도 같은 URL의 과거 이력은 유지합니다.
async def test_history_survives_added_control(page: Page) -> None:
    await page.set_content('''<input aria-label="아이디"
        oninput="document.querySelector('button').hidden=false"><button hidden>지우기</button>
        <input aria-label="비밀번호" type="password">''')
    model = ScriptModel(actions=(
        {"action": "fill", "index": 0, "text": "private-id"},
        {"action": "human", "reason": "테스트 종료"},
    ))
    await _run_login(page, FakeSite(), model)
    assert len(model.requests[0]["observation"]["elements"]) == 2
    assert len(model.requests[1]["observation"]["elements"]) == 3
    assert model.requests[1]["history"][0]["target_label"] == "아이디"


# DOM이 그대로여도 URL이 바뀌면 다음 요청에서 이전 화면의 이력을 제거합니다.
async def test_history_resets_on_url_change(page: Page) -> None:
    await page.set_content('''<input aria-label="아이디">
        <button onclick="history.pushState({}, '', '/next')">다음</button>''')
    model = ScriptModel(actions=(
        {"action": "fill", "index": 0, "text": "private-id"},
        {"action": "click", "index": 1},
        {"action": "human", "reason": "테스트 종료"},
    ))
    await _run_login(page, FakeSite(), model)
    assert len(model.requests[1]["history"]) == 1
    assert model.requests[2]["observation"]["url"] == f"https://{HOST}/next"
    assert model.requests[2]["history"] == []


# 입력 뒤 오류나 문제 변경에 따른 수정은 계속 허용하고 마지막 입력 상태를 전달합니다.
@pytest.mark.parametrize("message", ["답이 틀렸습니다", "문제가 변경되었습니다"])
async def test_history_allows_correction(page: Page, message: str) -> None:
    await page.set_content(f'''<p>{message}</p><input aria-label="정답">
        <button onclick="document.body.innerHTML='<h1 id=authenticated>완료</h1>'">확인</button>''')
    model = ScriptModel(actions=(
        {"action": "fill", "index": 0, "text": "first-answer"},
        {"action": "fill", "index": 0, "text": "corrected-answer"},
        {"action": "click", "index": 1},
    ))
    assert (await _run_login(page, FakeSite(), model)).status == "authenticated"
    assert len(model.requests[2]["history"]) == 2
    assert model.requests[2]["history"][-1]["input_state"] == "입력값 있음"


# 화면이 입력값을 라벨에 복사해도 이력에는 그 원문을 포함하지 않습니다.
async def test_history_redacts_answer_in_label(page: Page) -> None:
    await page.set_content('''<input oninput="this.setAttribute('aria-label', this.value)">
        <button>확인</button>''')
    model = ScriptModel(actions=(
        {"action": "fill", "index": 0, "text": "secret-answer"},
        {"action": "human", "reason": "테스트 종료"},
    ))
    await _run_login(page, FakeSite(), model)
    assert model.requests[1]["history"][0]["target_label"] == "[비공개]"


# 같은 값이면 실제 fill 호출을 생략하고 빈 값이나 다른 값은 정상 입력합니다.
@pytest.mark.parametrize("current", ["", "old-answer", "same-answer"])
async def test_fill_skips_only_equal_value(page: Page, monkeypatch: pytest.MonkeyPatch, current: str) -> None:
    await page.set_content('<input aria-label="정답">')
    await page.locator('input').fill(current)
    _, elements = await _observe_page(page)
    fill = AsyncMock(wraps=elements[0].fill)
    monkeypatch.setattr(elements[0], "fill", fill)
    action = LOGIN_ACTION.validate_python({"action": "fill", "index": 0, "text": "same-answer"})
    outcome = await _execute_action(page, action, elements, FakeSite().policy)
    if current == "same-answer":
        fill.assert_not_awaited()
        assert outcome == "이미 같은 값이 있어 입력 생략"
    else:
        fill.assert_awaited_once_with("same-answer")
        assert outcome == "실행 완료"
    assert await page.locator('input').input_value() == "same-answer"


# 반복 입력 생략 결과와 대상 정보가 다음 AI 호출에 원문 없이 전달됩니다.
async def test_skipped_fill_reaches_history(page: Page) -> None:
    await page.set_content('<input aria-label="정답">')
    model = ScriptModel(actions=(
        {"action": "fill", "index": 0, "text": "secret-answer"},
        {"action": "fill", "index": 0, "text": "secret-answer"},
        {"action": "human", "reason": "테스트 종료"},
    ))
    await _run_login(page, FakeSite(), model)
    history = model.requests[2]["history"]
    assert history[-1]["outcome"] == "이미 같은 값이 있어 입력 생략"
    assert history[-1]["target_label"] == "정답"
    assert history[-1]["input_state"] == "입력값 있음"
    assert "secret-answer" not in json.dumps(history)


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
