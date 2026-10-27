"""IndexNow 요청·응답 스키마와 입력 검증을 정의합니다."""

import re
from typing import Annotated, Literal, Self
from urllib.parse import SplitResult, unquote, urlsplit

from pydantic import (
    AfterValidator,
    AnyHttpUrl,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    computed_field,
    field_validator,
    model_validator,
)

MAX_URLS = 10_000
SubmissionStatus = Literal["accepted", "key_pending", "failed"]
HOST_PATTERN = re.compile(
    r"(?=.{1,253}\Z)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?"
    r"(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*"
)


# HTTP 주소를 검사하고, 경로 검증용 파싱 결과를 반환합니다.
def _parse_url(value: str) -> SplitResult:
    if not isinstance(value, str) or not value:
        raise ValueError("비어 있지 않은 URL 문자열이 필요합니다.")
    if (
        any(character.isspace() or ord(character) < 32 or ord(character) == 127 for character in value)
        or "\\" in value
        or "#" in value
        or re.search(r"%(?![0-9a-fA-F]{2})", value)
    ):
        raise ValueError("URL에 공백·제어 문자·역슬래시·프래그먼트·잘못된 인코딩을 넣을 수 없습니다.")
    try:
        parsed = urlsplit(value)
        AnyHttpUrl(value)
        port = parsed.port
    except (ValueError, ValidationError):
        raise ValueError("유효한 HTTP 또는 HTTPS URL이 필요합니다.") from None
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or (port is not None and port == 0)
    ):
        raise ValueError("인증정보 없는 HTTP 또는 HTTPS URL이 필요합니다.")
    # 서버별 경로 해석 차이로 키 적용 범위가 달라지는 모호한 경로는 거부합니다.
    path = unquote(parsed.path)
    if (
        any(part in {".", ".."} for part in path.split("/"))
        or "\\" in path
        or "%" in path
        or any(ord(character) < 32 or ord(character) == 127 for character in path)
    ):
        raise ValueError("URL 경로에 상위·현재 경로 참조나 모호한 인코딩을 넣을 수 없습니다.")
    return parsed


# 주소를 보정하지 않고 검사하여 키 적용 경로와 제출할 주소를 일치시킵니다.
def _validate_url(value: str) -> str:
    _parse_url(value)
    return value


IndexNowUrl = Annotated[str, AfterValidator(_validate_url)]
IndexNowKey = Annotated[
    str, Field(min_length=8, max_length=128, pattern=r"^[a-fA-F0-9-]+$"),
]


class IndexNowRequest(BaseModel):
    """생성 시 형식·호스트·키 적용 경로를 검증하는 불변 요청입니다."""

    model_config = ConfigDict(frozen=True, extra="forbid", hide_input_in_errors=True)

    host: str
    # Naver·Bing에서 함께 사용하도록 두 규격이 공통으로 허용하는 문자만 받습니다.
    key: IndexNowKey = Field(repr=False)
    urls: tuple[IndexNowUrl, ...] = Field(min_length=1, max_length=MAX_URLS)
    key_location: IndexNowUrl | None = None

    # 스킴·경로·포트가 없는 호스트인지 확인합니다.
    @field_validator("host")
    @classmethod
    def validate_host(cls, value: str) -> str:
        if not HOST_PATTERN.fullmatch(value):
            raise ValueError("host에는 스킴·경로·포트 없는 호스트를 입력하세요. 국제화 도메인은 Punycode를 사용하세요.")
        return value

    # 원본 개수 제한을 통과한 URL 목록에서 순서를 유지하며 중복을 제거합니다.
    @field_validator("urls")
    @classmethod
    def deduplicate_urls(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        return tuple(dict.fromkeys(value))

    # URL과 키 파일이 같은 호스트와 허용 디렉터리에 속하는지 검사합니다.
    @model_validator(mode="after")
    def validate_scope(self) -> Self:
        key_directory = "/"
        if self.key_location is not None:
            location = urlsplit(self.key_location)
            if location.hostname != self.host.lower():
                raise ValueError("키 파일은 host와 같은 호스트에 있어야 합니다.")
            if not location.path or location.path.endswith("/") or "?" in self.key_location:
                raise ValueError("key_location에는 쿼리 없는 키 파일 주소를 입력하세요.")
            key_directory = unquote(location.path).rsplit("/", 1)[0] + "/"

        for url in self.urls:
            parsed = urlsplit(url)
            if parsed.hostname != self.host.lower():
                raise ValueError("모든 URL은 host와 같은 호스트에 속해야 합니다.")
            if not (unquote(parsed.path) or "/").startswith(key_directory):
                raise ValueError("URL이 키 파일 디렉터리의 적용 범위를 벗어났습니다.")
        return self


class IndexNowResult(BaseModel):
    """HTTP 접수 결과이며, 실제 수집·색인 상태를 뜻하지 않습니다."""

    model_config = ConfigDict(frozen=True, extra="forbid", hide_input_in_errors=True)

    http_status: int = Field(strict=True, ge=100, le=599)
    requested_at: AwareDatetime

    # HTTP 응답에서 접수 결과를 계산하고 직렬화 결과에도 포함합니다.
    @computed_field
    @property
    def status(self) -> SubmissionStatus:
        if self.http_status == 200:
            return "accepted"
        if self.http_status == 202:
            return "key_pending"
        return "failed"
