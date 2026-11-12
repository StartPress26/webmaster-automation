"""인증 계정 등록 요청과 비밀파일 참조를 제외한 조회 응답입니다."""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StrictBool, field_validator

SecretReference = Annotated[str, Field(min_length=1)]


# 필드가 AuthAccountRead와 같지만 이건 api에서의 등록용으로 vlidate 추가되어 있다.
class AuthAccountCreate(BaseModel):
    """서버 비공개 폴더 기준 상대 경로를 인증 계정에 연결합니다."""

    model_config = ConfigDict(
        frozen=True, str_strip_whitespace=True, extra="forbid", hide_input_in_errors=True,
    )

    email: EmailStr
    google_secret_ref: SecretReference | None = Field(default=None, repr=False)
    bing_secret_ref: SecretReference | None = Field(default=None, repr=False)

    # 절대 경로와 상위 폴더 이동을 거부하며 실제 파일 접근 검증은 로더가 맡습니다.
    @field_validator("google_secret_ref", "bing_secret_ref")
    @classmethod
    def validate_secret_reference(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if (
            "\\" in value or ":" in value
            or any(character.isspace() or ord(character) < 32 or ord(character) == 127 for character in value)
            or any(part in {"", ".", ".."} for part in value.split("/"))
        ):
            raise ValueError("비밀파일 참조는 상위 폴더 이동 없는 상대 파일 경로여야 합니다.")
        return value


class AuthAccountRead(BaseModel):
    """파일 존재·인증 성공 여부와 별개로 인증 참조의 등록 여부만 반환합니다."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    email: EmailStr
    google_configured: StrictBool
    bing_configured: StrictBool


class AuthAccountList(BaseModel):
    """인증 계정 조회 결과를 불변 목록으로 반환합니다."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    items: tuple[AuthAccountRead, ...]
