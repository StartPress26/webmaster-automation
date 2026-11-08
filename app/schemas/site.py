"""메인 사이트 등록 요청과 조회 응답입니다."""

from datetime import datetime
from typing import Literal, Self
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import (
    AnyHttpUrl,
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    field_validator,
    model_validator,
)

from app.engines.indexnow.schemas import IndexNowKey, IndexNowRequest, IndexNowUrl


class SiteCreate(BaseModel):
    """사용자가 입력하는 메인 사이트 정보입니다."""

    model_config = ConfigDict(
        frozen=True, str_strip_whitespace=True, extra="forbid", hide_input_in_errors=True
    )

    client_id: UUID
    name: str = Field(min_length=1)
    url: str
    owner_type: Literal["internal", "client"]
    cms_type: str | None = None
    can_edit_site: StrictBool | None = None
    indexnow_key: IndexNowKey | None = Field(default=None, repr=False)
    indexnow_key_location: IndexNowUrl | None = None

    # HTTP·HTTPS 주소를 검증하고, DB에 저장할 문자열의 바이트 길이를 제한합니다.
    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        if any(character.isspace() or ord(character) < 32 for character in value):
            raise ValueError("URL에 공백이나 제어 문자를 포함할 수 없습니다.")
        if "\\" in value:
            raise ValueError("URL에 역슬래시를 포함할 수 없습니다.")

        # 파서가 생략된 구분자나 호스트 앞 슬래시를 자동 보정하지 않도록 합니다.
        scheme, separator, address = value.partition("://")
        if scheme.lower() not in {"http", "https"} or not separator or address.startswith("/"):
            raise ValueError("호스트가 있는 HTTP 또는 HTTPS 주소를 입력하세요.")

        parsed = AnyHttpUrl(value)
        if parsed.username is not None or parsed.password is not None:
            raise ValueError("URL에 사용자 이름이나 비밀번호를 포함할 수 없습니다.")
        if parsed.fragment is not None:
            raise ValueError("URL에서 # 뒤의 프래그먼트를 제거하세요.")

        normalized = str(parsed)
        if len(normalized.encode("utf-8")) > 2048:
            raise ValueError("URL은 정규화 후 UTF-8 기준 2,048바이트 이하여야 합니다.")

        return normalized

    # 키·파일 주소의 동시 입력과 메인 사이트에 대한 적용 범위를 검증합니다.
    @model_validator(mode="after")
    def validate_indexnow_settings(self) -> Self:
        if self.indexnow_key is None and self.indexnow_key_location is None:
            return self
        if self.indexnow_key is None or self.indexnow_key_location is None:
            raise ValueError("IndexNow 키와 키 파일 주소를 함께 입력하세요.")

        IndexNowRequest(
            host=urlsplit(self.url).hostname or "",
            key=self.indexnow_key,
            key_location=self.indexnow_key_location,
            urls=(self.url,),
        )

        return self


class SiteRead(BaseModel):
    """DB에 저장된 메인 사이트 정보를 응답으로 변환합니다."""

    model_config = ConfigDict(frozen=True, from_attributes=True)

    id: UUID
    client_id: UUID
    parent_site_id: None
    target_type: Literal["site"]
    name: str
    url: str
    owner_type: Literal["internal", "client"]
    cms_type: str | None
    can_edit_site: bool | None
    is_active: bool
    created_at: datetime


class SiteList(BaseModel):
    """메인 사이트 목록 응답입니다."""

    model_config = ConfigDict(frozen=True)

    items: tuple[SiteRead, ...]
