"""실제 접속 없이 네이버 엔진의 로그인 연결·동일 탭 사용·종료를 검증합니다."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import cast
from unittest.mock import AsyncMock

import pytest
from playwright.async_api import Page, Route, async_playwright

from app.engines import naver
from app.engines.naver import NaverEngine, NaverEngineError, NaverSiteSummary
from app.login_bot.schemas import LoginCredentials, SessionKey
from app.login_bot.session import SessionStore
from app.login_bot.sites.naver import NaverLoginSite

pytestmark = pytest.mark.anyio


# 비동기 테스트는 asyncio로 실행합니다.
@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


# 로그인 컨텍스트가 받은 설정과 조회 종료 시 정리를 확인합니다.
@pytest.mark.parametrize("read_fails", [False, True])
async def test_summary_uses_authenticated_page(
    monkeypatch: pytest.MonkeyPatch, read_fails: bool,
) -> None:
    model = AsyncMock()
    site = NaverLoginSite(LoginCredentials(login_id="test-id", password="test-password"))
    key = SessionKey(site="naver", account_id="primary")
    store = SessionStore()
    engine = NaverEngine(site, key, model, store=store, headless=True)
    page = cast(Page, object())
    entered = AsyncMock()
    closed = AsyncMock()
    result = NaverSiteSummary(
        site_url="https://example.com/", checked_at=datetime.now(timezone.utc), text="조회 화면",
    )
    select = AsyncMock()
    read = AsyncMock(side_effect=RuntimeError("조회 실패")) if read_fails else AsyncMock(return_value=result)

    # 로그인봇을 대신해 같은 탭을 빌려주고 성공·실패 모두에서 종료를 기록합니다.
    @asynccontextmanager
    async def authenticated_page(*args: object, **kwargs: object) -> AsyncGenerator[Page, None]:
        await entered(*args, **kwargs)
        try:
            yield page
        finally:
            await closed()

    monkeypatch.setattr(naver, "authenticated_page", authenticated_page)
    monkeypatch.setattr(NaverEngine, "_open_index_status", select)
    monkeypatch.setattr(NaverEngine, "_read_site_summary", read)

    if read_fails:
        with pytest.raises(RuntimeError, match="조회 실패"):
            await engine.get_site_summary(result.site_url)
    else:
        assert await engine.get_site_summary(result.site_url) is result

    entered.assert_awaited_once_with(site, key, model=model, store=store, headless=True)
    select.assert_awaited_once_with(page, result.site_url)
    read.assert_awaited_once_with(page)
    closed.assert_awaited_once()
    model.complete_json.assert_not_awaited()


INDEX_HTML = '''<label for="url">사이트 URL</label><input id="url" type="text">
    <button id="confirm">확인</button>
    <button onclick="document.body.dataset.crawl='requested'">수집 요청</button>
    <script>document.getElementById('confirm').onclick = () => {
        document.body.dataset.checkedUrl = document.getElementById('url').value;
        setTimeout(() => {
            const result = document.createElement('div');
            result.className = 'v-card__text primary--text';
            result.textContent = '문서가 성공적으로 색인됐습니다. 해당 문서를 검색할 수 있습니다.';
            const advice = result.cloneNode(); advice.textContent = '수집 요청해보세요.';
            document.body.append(result, advice);
        }, 80);
    };</script>'''
TARGET_URL = "https://example.com/"


# 실제 화면의 입력창·확인 버튼·판정 영역 구조를 로컬 응답으로 재현합니다.
@pytest.fixture
async def index_page(monkeypatch: pytest.MonkeyPatch) -> AsyncGenerator[Page, None]:
    monkeypatch.setattr(naver, "INSPECTION_TIMEOUT_MS", 500)
    async with async_playwright() as runtime:
        browser = await runtime.chromium.launch(headless=True)
        try:
            context = await browser.new_context()

            # 모든 요청을 로컬 문서로 처리해 실제 사이트에 연결하지 않습니다.
            async def respond(route: Route) -> None:
                await route.fulfill(content_type="text/html; charset=utf-8", body=INDEX_HTML)

            await context.route("**/*", respond)
            yield await context.new_page()
        finally:
            await browser.close()


# 실제 네이버 규칙과 가짜 AI를 사용한 엔진을 제공합니다.
@pytest.fixture
def engine() -> NaverEngine:
    return NaverEngine(
        NaverLoginSite(LoginCredentials(login_id="test-id", password="test-password")),
        SessionKey(site="naver", account_id="primary"), AsyncMock(), headless=True,
    )


# 어느 콘솔 메뉴에 있든 전용 경로로 이동해 정확한 URL을 확인하고 수집 요청은 누르지 않습니다.
@pytest.mark.parametrize("initial_path", ["/console/board", "/console/site/report/crawl"])
async def test_opens_index_status_from_other_menu(
    index_page: Page, engine: NaverEngine, initial_path: str,
) -> None:
    await index_page.goto("https://searchadvisor.naver.com" + initial_path)
    await engine._open_index_status(index_page, "https://EXAMPLE.com:443/")
    assert index_page.url == naver.INSPECTION_URL + "?site=https%3A%2F%2Fexample.com"
    assert await index_page.locator("body").get_attribute("data-checked-url") == TARGET_URL
    assert await index_page.locator("body").get_attribute("data-crawl") is None
    result = await engine._read_site_summary(index_page)
    assert result.site_url == TARGET_URL
    assert result.text == "문서가 성공적으로 색인됐습니다. 해당 문서를 검색할 수 있습니다."
    assert "수집 요청" not in result.text
    assert result.checked_at.tzinfo == timezone.utc
    cast(AsyncMock, engine.model).complete_json.assert_not_awaited()


# 고정 이동·URL 확인·결과 읽기가 공개 진입점에서도 같은 로그인 탭으로 연결됩니다.
async def test_get_summary_uses_fixed_inspection_flow(
    index_page: Page, engine: NaverEngine, monkeypatch: pytest.MonkeyPatch,
) -> None:
    # 로그인된 탭만 전달하여 실제 로그인과 AI 호출을 대체합니다.
    @asynccontextmanager
    async def logged_in(*args: object, **kwargs: object) -> AsyncGenerator[Page, None]:
        yield index_page

    monkeypatch.setattr(naver, "authenticated_page", logged_in)
    result = await engine.get_site_summary(TARGET_URL)
    assert result.site_url == TARGET_URL
    assert "성공적으로 색인" in result.text
    cast(AsyncMock, engine.model).complete_json.assert_not_awaited()


# 인증 콜백을 잠시 거친 뒤 정상 페이지로 돌아오는 경우 최종 도착까지 기다립니다.
async def test_waits_for_auth_callback(
    index_page: Page, engine: NaverEngine, monkeypatch: pytest.MonkeyPatch,
) -> None:
    callback = "https://searchadvisor.naver.com/auth/callback"
    original_goto = index_page.goto

    # 서버 리다이렉트의 최종 도착 주소를 로컬 콜백 문서로 대체합니다.
    async def arrive_at_callback(url: str, **kwargs: object) -> None:
        await original_goto(callback, wait_until="domcontentloaded")

    # 인증정보 없이 지연된 클라이언트 리다이렉트만 재현합니다.
    async def callback_page(route: Route) -> None:
        destination = naver.INSPECTION_URL + "?site=https%3A%2F%2Fexample.com"
        await route.fulfill(content_type="text/html", body=(
            f'<script>setTimeout(() => location.href="{destination}", 50);</script>'
        ))

    await index_page.route(callback, callback_page)
    monkeypatch.setattr(index_page, "goto", arrive_at_callback)
    await engine._open_index_status(index_page, TARGET_URL)
    assert "성공적으로 색인" in (await engine._read_site_summary(index_page)).text


# 로그인·미등록 안내 등 다른 화면으로 보내지면 결과로 오인하지 않습니다.
@pytest.mark.parametrize(("destination", "code"), [
    ("https://nid.naver.com/nidlogin.login", "authentication"),
    ("https://searchadvisor.naver.com/console/board", "navigation"),
    (naver.INSPECTION_URL + "?site=https%3A%2F%2Fother.example", "navigation"),
])
async def test_rejects_wrong_destination(
    index_page: Page, engine: NaverEngine, destination: str, code: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_goto = index_page.goto

    # 외부 네트워크 리다이렉트를 사용하지 않고 다른 최종 문서에 도착한 상태를 만듭니다.
    async def arrive_elsewhere(url: str, **kwargs: object) -> None:
        await original_goto(destination, wait_until="domcontentloaded")

    monkeypatch.setattr(index_page, "goto", arrive_elsewhere)
    with pytest.raises(NaverEngineError) as error:
        await engine._open_index_status(index_page, TARGET_URL)
    assert error.value.code == code


# 결과가 나오지 않거나 이전 판정이 남아 있으면 오래된 값을 반환하지 않습니다.
@pytest.mark.parametrize(("html", "code"), [
    ('<input type="text"><button>확인</button>', "navigation"),
    ('<input type="text"><button>확인</button><div class="v-card__text primary--text">이전 판정</div>', "response"),
])
async def test_rejects_missing_or_stale_result(
    index_page: Page, engine: NaverEngine, html: str, code: str,
) -> None:
    # 지정한 결과 상태를 최초 문서부터 제공합니다.
    async def respond(route: Route) -> None:
        await route.fulfill(content_type="text/html; charset=utf-8", body=html)

    await index_page.route(naver.INSPECTION_URL + "*", respond)
    with pytest.raises(NaverEngineError) as error:
        await engine._open_index_status(index_page, TARGET_URL)
    assert error.value.code == code


# 실제 판정 문구는 추론하거나 긍정 문구로 대체하지 않고 그대로 반환합니다.
async def test_reads_non_indexed_message(index_page: Page, engine: NaverEngine) -> None:
    await engine._open_index_status(index_page, TARGET_URL)
    await index_page.locator(naver.INSPECTION_MESSAGE).first.evaluate(
        "el => el.textContent = '문서가 색인되지 않았습니다.'",
    )
    assert (await engine._read_site_summary(index_page)).text == "문서가 색인되지 않았습니다."


# 잘못된 입력은 브라우저를 열거나 인증정보를 AI에 보내기 전에 거부합니다.
@pytest.mark.parametrize("site_url", [
    "", "not-a-url", "javascript:alert(1)", "https://id:secret@example.com/",
    "https://example.com/?token=secret", "https://example.com/#secret", "https://example.com/ bad",
])
async def test_rejects_invalid_site_before_login(
    engine: NaverEngine, site_url: str, monkeypatch: pytest.MonkeyPatch,
) -> None:
    login = AsyncMock()
    monkeypatch.setattr(naver, "authenticated_page", login)
    with pytest.raises(NaverEngineError) as error:
        await engine.get_site_summary(site_url)
    assert error.value.code == "invalid_url"
    assert "secret" not in str(error.value)
    login.assert_not_called()
