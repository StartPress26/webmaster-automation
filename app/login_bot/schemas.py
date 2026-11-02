"""공통 브라우저 로그인 정책·결과·세션 식별자를 정의합니다."""

import re
from dataclasses import dataclass, field
from typing import Annotated, Literal, Self
from urllib.parse import urlsplit

from pydantic import (
    AnyHttpUrl,
    BaseModel,
    ConfigDict,
    Field,
    TypeAdapter,
    field_validator,
    model_validator,
)

HOST_PATTERN = re.compile(
    r"(?=.{1,253}\Z)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?"
    r"(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*"
)


@dataclass(frozen=True)
class LoginCredentials:
    """사이트 구현을 생성할 때 주입하는 로그인 정보이며 출력 시 값을 숨깁니다."""

    login_id: str = field(repr=False)
    password: str = field(repr=False)

    # 빈 인증정보를 거부하되 오류 메시지에 값을 포함하지 않습니다.
    def __post_init__(self) -> None:
        if not self.login_id or not self.password:
            raise ValueError("로그인 ID와 비밀번호를 모두 입력하세요.")


class LoginPolicy(BaseModel):
    """로그인 시작 위치·AI 목표·실행 한도이며 성공 판정 함수는 별도로 전달합니다."""

    model_config = ConfigDict(frozen=True, extra="forbid", hide_input_in_errors=True)

    start_url: str
    allowed_hosts: tuple[str, ...] = Field(min_length=1)
    goal: str = Field(min_length=1)
    max_steps: int = Field(default=25, ge=1, strict=True)
    max_login_attempts: int = Field(default=3, ge=1, strict=True)
    timeout_seconds: float = Field(default=180.0, gt=0, allow_inf_nan=False, strict=True)
    human_timeout_seconds: float = Field(default=180.0, gt=0, allow_inf_nan=False, strict=True)

    # 로그인 주소는 인증정보·공백·프래그먼트 없는 HTTPS 주소로 제한합니다.
    @field_validator("start_url")
    @classmethod
    def validate_start_url(cls, value: str) -> str:
        if (
            any(character.isspace() or ord(character) < 32 or ord(character) == 127 for character in value)
            or "\\" in value
        ):
            raise ValueError("시작 URL에 공백·제어 문자·역슬래시를 사용할 수 없습니다.")
        if not urlsplit(value).hostname:
            raise ValueError("시작 URL에는 스킴과 호스트가 있는 HTTPS 주소가 필요합니다.")
        parsed = AnyHttpUrl(value)
        if (
            parsed.scheme != "https"
            or parsed.username is not None
            or parsed.password is not None
            or parsed.fragment is not None
            or parsed.port != 443
        ):
            raise ValueError("시작 URL은 인증정보·프래그먼트 없는 기본 포트의 HTTPS 주소여야 합니다.")
        return str(parsed)

    # 허용 호스트는 주소나 와일드카드가 아닌 정확한 도메인으로 받고 중복을 제거합니다.
    @field_validator("allowed_hosts")
    @classmethod
    def validate_allowed_hosts(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if any(not HOST_PATTERN.fullmatch(host) for host in value):
            raise ValueError("허용 호스트에는 스킴·경로·포트·와일드카드 없는 도메인을 입력하세요.")
        return tuple(dict.fromkeys(host.lower() for host in value))

    # 공백뿐인 목표를 거부하고 앞뒤 공백을 제거합니다.
    @field_validator("goal")
    @classmethod
    def validate_goal(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("로그인 목표를 입력하세요.")
        return value.strip()

    # 작업 시작 주소도 허용된 호스트에 속하는지 확인합니다.
    @model_validator(mode="after")
    def validate_start_host(self) -> Self:
        if urlsplit(self.start_url).hostname not in self.allowed_hosts:
            raise ValueError("시작 URL의 호스트를 allowed_hosts에 포함하세요.")
        return self


class LoginResult(BaseModel):
    """로그인 실행 결과이며 브라우저·인증정보·인증 상태 원본은 포함하지 않습니다."""

    model_config = ConfigDict(frozen=True, extra="forbid", hide_input_in_errors=True)

    status: Literal["authenticated", "requires_user", "failed"]
    # 원본 브라우저·API 예외 대신 인증값을 포함하지 않는 종료 사유를 전달합니다.
    reason: str = Field(min_length=1)
    steps: int = Field(default=0, ge=0, strict=True)
    login_attempts: int = Field(default=0, ge=0, strict=True)

    # 공백뿐인 종료 사유를 거부하고 앞뒤 공백을 제거합니다.
    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("로그인 종료 사유를 입력하세요.")
        return value.strip()


class SessionKey(BaseModel):
    """인증 상태를 구분하는 서비스·계정 식별자이며 실제 ID·비밀번호는 넣지 않습니다."""

    model_config = ConfigDict(frozen=True, extra="forbid", hide_input_in_errors=True)

    site: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_-]*$")
    account_id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_-]*$")


class _LoginActionBase(BaseModel):
    """AI가 고른 로그인 동작의 공통 설정이며 검증 오류에 입력값을 포함하지 않습니다."""

    model_config = ConfigDict(frozen=True, extra="forbid", hide_input_in_errors=True)


class ElementAction(_LoginActionBase):
    """현재 관찰의 요소 번호를 지정하는 클릭·입력 동작입니다."""

    action: Literal["click", "fill"]
    index: int = Field(ge=0, strict=True)
    text: str = Field(default="", max_length=2000, repr=False)

    # 입력 동작에는 값을, 클릭 동작에는 빈 값을 요구합니다.
    @model_validator(mode="after")
    def validate_text(self) -> Self:
        if (self.action == "fill") != bool(self.text):
            raise ValueError("fill에는 입력값이 필요하고 click에는 입력값을 넣을 수 없습니다.")
        return self


class ScrollAction(_LoginActionBase):
    """화면을 위아래로 이동하는 동작입니다."""

    action: Literal["scroll"]
    direction: Literal["up", "down"]


class SimpleAction(_LoginActionBase):
    """화면 전환을 기다리는 동작입니다."""

    action: Literal["wait"]


class HumanAction(_LoginActionBase):
    """AI가 처리할 수 없어 사용자에게 넘기는 동작입니다."""

    action: Literal["human"]
    reason: str = Field(min_length=1, max_length=500)


LoginAction = Annotated[
    ElementAction | ScrollAction | SimpleAction | HumanAction, Field(discriminator="action")
]
LOGIN_ACTION: TypeAdapter[LoginAction] = TypeAdapter(
    LoginAction, config=ConfigDict(hide_input_in_errors=True)
)
