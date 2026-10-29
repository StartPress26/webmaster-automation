"""공통 브라우저 로그인 정책·결과·세션 식별자를 정의합니다."""

import re
from typing import Literal, Self
from urllib.parse import urlsplit

from pydantic import (
    AnyHttpUrl,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

HOST_PATTERN = re.compile(
    r"(?=.{1,253}\Z)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?"
    r"(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*"
)


class LoginPolicy(BaseModel):
    """로그인 시작 위치·AI 목표·실행 한도이며 성공 판정 함수는 별도로 전달합니다."""

    model_config = ConfigDict(frozen=True, extra="forbid", hide_input_in_errors=True)

    start_url: str
    allowed_hosts: tuple[str, ...] = Field(min_length=1)
    goal: str = Field(min_length=1)
    max_steps: int = Field(default=25, ge=1, strict=True)
    max_login_attempts: int = Field(default=3, ge=1, strict=True)
    timeout_seconds: float = Field(default=180.0, gt=0, allow_inf_nan=False, strict=True)

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
