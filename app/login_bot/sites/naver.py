"""네이버 서치어드바이저 로그인 화면의 판정과 로그인 정책을 담당합니다."""

import re
from dataclasses import dataclass, field
from typing import ClassVar
from urllib.parse import urlsplit

from playwright.async_api import Page

from app.login_bot.schemas import LoginCredentials, LoginPolicy

CONSOLE_URL = "https://searchadvisor.naver.com/console/board"
CREDENTIAL_ERROR = re.compile(
    r"아이디\s*(또는|혹은).*비밀번호.*(올바르지|확인)|비밀번호가\s*일치하지"
)


# 정확한 호스트와 경로의 기본 포트 HTTPS 주소인지 확인합니다.
def _matches_url(url: str, host: str, path: str) -> bool:
    try:
        parsed = urlsplit(url)
        return (
            parsed.scheme == "https"
            and parsed.hostname == host
            and parsed.port in (None, 443)
            and parsed.username is None
            and parsed.password is None
            and parsed.path.rstrip("/") == path
        )
    except ValueError:
        return False


@dataclass(frozen=True)
class NaverLoginSite:
    """인증정보는 외부에서 주입하며 공통 에이전트가 AI에 전달해 로그인 행동을 결정합니다.

    선택자는 기존 로컬 실험에 기반하며 실제 네이버 화면 변경 시 재검증이 필요합니다.
    """

    credentials: LoginCredentials = field(repr=False)

    name: ClassVar[str] = "naver"
    policy: ClassVar[LoginPolicy] = LoginPolicy(
        start_url=CONSOLE_URL,
        allowed_hosts=("searchadvisor.naver.com", "nid.naver.com", "www.naver.com"),
        goal="네이버 서치어드바이저 콘솔에 로그인합니다. 사이트 등록·변경은 수행하지 않습니다.",
    )

    # 정확한 콘솔 주소와 표시된 사이트 등록 영역을 함께 확인합니다.
    async def is_authenticated(self, page: Page) -> bool:
        if not _matches_url(page.url, "searchadvisor.naver.com", "/console/board"):
            return False
        return any([
            await element.is_visible()
            for element in await page.get_by_text("사이트 등록", exact=True).all()
        ])

    # 네이버 로그인 화면의 표시된 계정 오류만 감지하며 캡차 오류와 구분합니다.
    async def credential_error_visible(self, page: Page) -> bool:
        if not _matches_url(page.url, "nid.naver.com", "/nidlogin.login"):
            return False
        return any([
            await element.is_visible()
            for element in await page.get_by_text(CREDENTIAL_ERROR).all()
        ])
