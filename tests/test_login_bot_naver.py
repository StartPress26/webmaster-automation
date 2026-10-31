"""외부 접속 없이 네이버 로그인 규칙과 인증정보 제출을 검증합니다."""

from collections.abc import AsyncIterator

import pytest
from playwright.async_api import Page, Route, async_playwright

from app.login_bot.sites.naver import NaverLoginSite
from app.login_bot.schemas import LoginCredentials
from app.login_bot.sites.base import LoginSite

pytestmark = pytest.mark.anyio
LOGIN_URL = "https://nid.naver.com/nidlogin.login"
CONSOLE_URL = "https://searchadvisor.naver.com/console/board"



# 비동기 테스트를 asyncio로 실행합니다.
@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


# 가짜 인증정보를 주입한 사이트 구현을 제공합니다.
@pytest.fixture
def site() -> NaverLoginSite:
    return NaverLoginSite(LoginCredentials(login_id="fake-id", password="fake-password"))


# 모든 요청을 로컬 HTML로 처리하여 실제 사이트에 연결하지 않습니다.
@pytest.fixture
async def page() -> AsyncIterator[Page]:
    async with async_playwright() as runtime:
        browser = await runtime.chromium.launch(headless=True)
        try:
            context = await browser.new_context()

            # 네트워크 대신 빈 문서를 반환합니다.
            async def respond(route: Route) -> None:
                await route.fulfill(status=200, content_type="text/html", body="<body></body>")

            await context.route("**/*", respond)
            yield await context.new_page()
        finally:
            await browser.close()


# 공통 인터페이스에 대입 가능하고 인증정보가 객체 출력에 노출되지 않는지 확인합니다.
async def test_site_contract(site: NaverLoginSite) -> None:
    contract: LoginSite = site
    assert contract.name == "naver"
    assert contract.policy.start_url == CONSOLE_URL
    assert "fake-id" not in repr(site)
    assert "fake-password" not in repr(site)
    assert contract.credentials.login_id == "fake-id"
    assert contract.credentials.password == "fake-password"


# 정확한 콘솔 URL과 표시된 사이트 등록 영역을 모두 요구하는지 확인합니다.
@pytest.mark.parametrize(
    ("url", "html", "expected"),
    [
        (CONSOLE_URL, "<h2>사이트 등록</h2>", True),
        (CONSOLE_URL + "/", "<h2>사이트 등록</h2>", True),
        (CONSOLE_URL, '<h2 hidden>사이트 등록</h2>', False),
        (CONSOLE_URL, "<h2>로그인</h2>", False),
        (LOGIN_URL, "<h2>사이트 등록</h2>", False),
        ("https://evil.example/console/board", "<h2>사이트 등록</h2>", False),
    ],
)
async def test_authenticated(
    page: Page, site: NaverLoginSite, url: str, html: str, expected: bool
) -> None:
    await page.goto(url)
    await page.set_content(html)
    assert await site.is_authenticated(page) is expected






# 캡차 오류와 계정 오류를 구분하고 숨겨진 오류는 무시하는지 확인합니다.
@pytest.mark.parametrize(
    ("html", "expected"),
    [
        ("<p>아이디 또는 비밀번호가 올바르지 않습니다.</p>", True),
        ("<p>비밀번호가 일치하지 않습니다.</p>", True),
        ("<p>자동입력 방지문자를 다시 입력해 주세요.</p>", False),
        ('<p hidden>비밀번호가 일치하지 않습니다.</p>', False),
    ],
)
async def test_credential_error(page: Page, site: NaverLoginSite, html: str, expected: bool) -> None:
    await page.goto(LOGIN_URL)
    await page.set_content(html)
    assert await site.credential_error_visible(page) is expected
