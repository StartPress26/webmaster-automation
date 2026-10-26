"""환경변수에서 데이터베이스 설정을 읽습니다."""

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from dotenv import dotenv_values
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

PROJECT_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    database_url: str = field(repr=False)


@lru_cache
def get_settings() -> Settings:
    """프로세스 환경변수를 우선하며 연결 문자열을 오류에 노출하지 않습니다."""
    values = dotenv_values(PROJECT_ROOT / ".env") | dict(os.environ)
    database_url = values.get("DATABASE_URL")
    if not database_url:
        raise ValueError("DATABASE_URL을 .env 또는 환경변수에 설정하세요.")

    try:
        url = make_url(database_url)
    except ArgumentError:
        raise ValueError("DATABASE_URL 형식이 올바르지 않습니다.") from None

    if url.drivername != "postgresql+asyncpg" or not url.database:
        raise ValueError("DB 이름이 있는 postgresql+asyncpg 연결 주소가 필요합니다.")
    return Settings(database_url=database_url)
