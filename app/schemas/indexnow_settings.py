"""IndexNow 설정의 입력과 키를 제외한 조회 응답입니다."""

from pydantic import BaseModel, ConfigDict, Field

from app.engines.indexnow.schemas import IndexNowKey, IndexNowUrl


class IndexNowSettingsWrite(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", hide_input_in_errors=True)

    key: IndexNowKey = Field(repr=False)
    key_location: IndexNowUrl


class IndexNowSettingsRead(BaseModel):
    model_config = ConfigDict(frozen=True)

    configured: bool
    key_location: str | None
