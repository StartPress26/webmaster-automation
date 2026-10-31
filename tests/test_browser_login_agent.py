"""실제 사이트·AI 없이 로컬 Chromium으로 로그인 에이전트의 세션 재사용과 브라우저 수명을 검증합니다."""

import asyncio
from dataclasses import dataclass, field
from pathlib import Path

import pytest
from playwright.async_api import Browser, BrowserContext, Page, Route, StorageState
from playwright.async_api import Error as PlaywrightError

from app.login_bot import login_agent
from app.login_bot.login_agent import LoginError, authenticated_page, is_allowed_url
from app.login_bot.schemas import LoginCredentials, LoginPolicy, SessionKey
from app.login_bot.session import SessionStore

pytestmark = pytest.mark.anyio
HOST = "login.example.test"
START_URL = f"https://{HOST}/start"
KEY = SessionKey(site="fake", account_id="primary")
AUTH_COOKIE = {
    "name": "auth", "value": "1", "domain": HOST, "path": "/",
    "expires": -1, "httpOnly": True, "secure": True, "sameSite": "Lax",
}


# 프로젝트에서 사용하는 asyncio 백엔드로만 실행합니다.
@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@dataclass
class FakeModel:
    """호출 횟수만 기록하는 가짜 AI입니다."""

    calls: int = 0

    # 호출 횟수를 기록하고 사용자 인증이 필요하다고 응답합니다.
    async def complete_json(
        self, system: str, user_text: str, image_data_url: str | None = None
    ) -> dict[str, object]:
        self.calls += 1
        return {"action": "human", "reason": "사용자 인증 필요"}


@dataclass(frozen=True)
class FakeSite:
    """가짜 로그인 사이트이며 콘솔 제목이 보이면 로그인 상태로 판정합니다."""

    name: str = "fake"
    policy: LoginPolicy = field(
        default_factory=lambda: LoginPolicy(start_url=START_URL, allowed_hosts=(HOST,), goal="로그인")
    )
    credentials: LoginCredentials = field(
        default_factory=lambda: LoginCredentials(login_id="fake-id", password="fake-password")
    )
    auth_delay: float = 0.0

    # 콘솔 제목이 보이는지로 로그인 성공을 판정하며 필요하면 지연시킵니다.
    async def is_authenticated(self, page: Page) -> bool:
        await asyncio.sleep(self.auth_delay)
        return await page.locator("h1#console").is_visible()



    # 계정 오류 문구가 보이는지 확인합니다.
    async def credential_error_visible(self, page: Page) -> bool:
        return await page.get_by_text("비밀번호가 일치하지").is_visible()


@dataclass
class FakeServer:
    """가짜 HTTPS 응답을 돌려주고 받은 요청 주소와 생성된 컨텍스트를 기록합니다."""

    requested: list[str] = field(default_factory=list)
    contexts: list[BrowserContext] = field(default_factory=list)

    # 인증 쿠키가 있으면 콘솔, 없으면 로그인 양식을 응답합니다.
    async def handle(self, route: Route) -> None:
        self.requested.append(route.request.url)
        cookie = await route.request.header_value("cookie") or ""
        body = '<h1 id="console">콘솔</h1>' if "auth=1" in cookie else '<input id="id"><input id="pw" type="password">'
        await route.fulfill(status=200, content_type="text/html; charset=utf-8", body=body)


# 실제 컨텍스트 생성 직후 가짜 응답 처리기를 연결합니다. 이동 차단은 그 뒤에 등록되어 먼저 실행됩니다.
@pytest.fixture
def server(monkeypatch: pytest.MonkeyPatch) -> FakeServer:
    fake = FakeServer()
    original = login_agent._new_context

    # 원래 컨텍스트 생성 결과에 가짜 서버를 연결하고 기록합니다.
    async def new_context(browser: Browser, state: StorageState | None) -> BrowserContext:
        context = await original(browser, state)
        await context.route("**/*", fake.handle)
        fake.contexts.append(context)
        return context

    monkeypatch.setattr(login_agent, "_new_context", new_context)
    return fake


# 테스트마다 별도 임시 폴더의 세션 저장소를 사용합니다.
@pytest.fixture
def store(tmp_path: Path) -> SessionStore:
    return SessionStore(root_dir=tmp_path / "sessions")


# 저장된 세션이 유효하면 AI 호출 없이 Page를 제공하고 세션을 다시 저장하는지 확인합니다.
async def test_reuses_saved_session(server: FakeServer, store: SessionStore) -> None:
    store.save(KEY, {"cookies": [AUTH_COOKIE], "origins": []})
    model = FakeModel()

    async with authenticated_page(FakeSite(), KEY, model=model, store=store, headless=True) as page:
        assert await page.locator("h1#console").is_visible()

    assert model.calls == 0
    saved = store.load(KEY)
    assert saved is not None
    assert any(cookie["name"] == "auth" for cookie in saved["cookies"])


# 블록이 끝나거나 블록 안에서 예외가 나도 브라우저가 종료되는지 확인합니다.
async def test_browser_closed_after_block(server: FakeServer, store: SessionStore) -> None:
    store.save(KEY, {"cookies": [AUTH_COOKIE], "origins": []})

    with pytest.raises(RuntimeError):
        async with authenticated_page(FakeSite(), KEY, model=FakeModel(), store=store, headless=True):
            raise RuntimeError("조회 실패")

    with pytest.raises(PlaywrightError):
        await server.contexts[0].new_page()


# 세션이 없으면 Page 대신 requires_user 결과를 담은 LoginError가 발생하는지 확인합니다.
async def test_missing_session_requires_user(server: FakeServer, store: SessionStore) -> None:
    model = FakeModel()

    with pytest.raises(LoginError) as error:
        async with authenticated_page(FakeSite(), KEY, model=model, store=store, headless=True):
            pytest.fail("로그인되지 않았는데 Page가 제공되었습니다.")

    assert error.value.result.status == "requires_user"
    assert store.load(KEY) is None


# 손상된 세션 파일은 무시하고 새 로그인 흐름으로 진행하는지 확인합니다.
async def test_corrupted_session_ignored(server: FakeServer, store: SessionStore) -> None:
    store.save(KEY, {"cookies": [], "origins": []})
    (store.root_dir / KEY.site / f"{KEY.account_id}.json").write_text("{broken")

    with pytest.raises(LoginError) as error:
        async with authenticated_page(FakeSite(), KEY, model=FakeModel(), store=store, headless=True):
            pass

    assert error.value.result.status == "requires_user"


# 로그인 성공 뒤에도 허용 호스트 밖으로의 이동은 서버에 도달하기 전에 중단되는지 확인합니다.
async def test_blocks_disallowed_navigation(server: FakeServer, store: SessionStore) -> None:
    store.save(KEY, {"cookies": [AUTH_COOKIE], "origins": []})

    async with authenticated_page(FakeSite(), KEY, model=FakeModel(), store=store, headless=True) as page:
        with pytest.raises(PlaywrightError):
            await page.goto("https://evil.example.test/")

    assert all("evil.example.test" not in url for url in server.requested)


# 페이지가 연 팝업은 즉시 닫혀 작업 Page 하나만 남는지 확인합니다.
async def test_closes_popup(server: FakeServer, store: SessionStore) -> None:
    store.save(KEY, {"cookies": [AUTH_COOKIE], "origins": []})

    async with authenticated_page(FakeSite(), KEY, model=FakeModel(), store=store, headless=True) as page:
        async with page.context.expect_page() as popup_info:
            await page.evaluate(f"window.open('{START_URL}')")
        popup = await popup_info.value
        for _ in range(50):
            if popup.is_closed():
                break
            await asyncio.sleep(0.02)

        assert popup.is_closed()
        assert page.context.pages == [page]


# 로그인 확인이 제한 시간을 넘기면 failed 결과로 끝나는지 확인합니다.
async def test_timeout_fails(server: FakeServer, store: SessionStore) -> None:
    policy = LoginPolicy(start_url=START_URL, allowed_hosts=(HOST,), goal="로그인", timeout_seconds=0.3)
    site = FakeSite(policy=policy, auth_delay=2.0)

    with pytest.raises(LoginError) as error:
        async with authenticated_page(site, KEY, model=FakeModel(), store=store, headless=True):
            pass

    assert error.value.result.status == "failed"
    assert "제한 시간" in error.value.result.reason


# 세션 키의 사이트와 로그인 사이트가 다르면 브라우저를 열기 전에 거부하는지 확인합니다.
async def test_rejects_mismatched_site(server: FakeServer, store: SessionStore) -> None:
    with pytest.raises(ValueError):
        async with authenticated_page(
            FakeSite(), SessionKey(site="other", account_id="primary"), model=FakeModel(), store=store
        ):
            pass

    assert server.contexts == []


# HTTPS·기본 포트·정확한 호스트·인증정보 없음 조건을 모두 만족해야 허용하는지 확인합니다.
@pytest.mark.parametrize(
    ("url", "allowed"),
    [
        (START_URL, True),
        (f"https://{HOST}:443/path", True),
        (f"http://{HOST}/", False),
        (f"https://{HOST}:8443/", False),
        (f"https://{HOST}:bad/", False),
        (f"https://user:pw@{HOST}/", False),
        (f"https://sub.{HOST}/", False),
        (f"https://{HOST}.evil.test/", False),
    ],
)
def test_is_allowed_url(url: str, allowed: bool) -> None:
    policy = LoginPolicy(start_url=START_URL, allowed_hosts=(HOST,), goal="로그인")

    assert is_allowed_url(url, policy) is allowed
