"""사이트별 로그인 규칙을 공통 로그인 에이전트에 전달하는 약속을 정의합니다."""

from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

from playwright.async_api import Locator, Page

from app.login_bot.schemas import LoginCredentials, LoginPolicy


@dataclass(frozen=True)
class SmsChallenge:
    """문자 발송 안내와 현재 화면의 입력·확인 요소를 묶습니다."""

    masked_phone: str | None
    code_input: Locator = field(repr=False)
    submit_button: Locator = field(repr=False)


class LoginSite(Protocol):
    """로그인 에이전트가 사이트별 구현에 요구하는 최소 기능입니다.

    인증정보는 구현 객체 생성 시 주입하며 미인증 상태에서 AI 요청에 전달합니다.
    성공 여부는 AI의 선언이 아니라 is_authenticated 결과로만 판단합니다.
    """

    # SessionKey.site와 같은 로그인 서비스 식별자입니다.
    @property
    def name(self) -> str: ...

    # 시작 주소·허용 호스트·AI 목표·실행 한도입니다.
    @property
    def policy(self) -> LoginPolicy: ...

    # AI가 로그인 입력에 사용할 인증정보이며 기록에는 남기지 않습니다.
    @property
    def credentials(self) -> LoginCredentials: ...

    # 인증 화면 또는 로그인 입력 화면이 준비될 때까지 기다립니다.
    async def wait_until_ready(self, page: Page) -> None: ...

    # 현재 화면이 로그인 완료 상태인지 사이트별 코드로 판정합니다.
    async def is_authenticated(self, page: Page) -> bool: ...

    # 아이디·비밀번호 불일치 안내가 화면에 보이는지 확인합니다.
    async def credential_error_visible(self, page: Page) -> bool: ...


@runtime_checkable
class SmsLoginSite(LoginSite, Protocol):
    """문자 인증 감지를 지원하는 사이트만 선택적으로 구현하는 계약입니다."""

    # 발송 안내와 입력 요소를 확인하며 모호하면 None을 반환합니다.
    async def detect_sms_challenge(self, page: Page) -> SmsChallenge | None: ...

    # 문자 인증 코드의 오답·만료 안내를 확인합니다.
    async def sms_code_error_visible(self, page: Page) -> bool: ...
