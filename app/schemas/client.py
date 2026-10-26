"""고객사 등록 요청과 조회 응답입니다."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ClientCreate(BaseModel):
    """고객사 등록 시 사용자가 입력하는 정보입니다."""

    model_config = ConfigDict(
        frozen=True,
        str_strip_whitespace=True,
        extra="forbid",
    )

    name: str = Field(min_length=1)
    manager_name: str | None = None


class ClientRead(BaseModel):
    """DB에 저장된 고객사 정보를 응답으로 변환합니다."""

    model_config = ConfigDict(frozen=True, from_attributes=True)

    id: UUID
    name: str
    manager_name: str | None
    created_at: datetime


class ClientList(BaseModel):
    """고객사 목록 응답입니다."""

    model_config = ConfigDict(frozen=True)

    items: tuple[ClientRead, ...]
