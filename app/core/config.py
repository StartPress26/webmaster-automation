"""환경변수에서 데이터베이스 설정을 읽습니다."""

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from dotenv import dotenv_values
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

# 실행 위치와 관계없이 프로젝트 루트의 .env를 찾습니다.
PROJECT_ROOT = Path(__file__).resolve().parents[2]


# 설정값은 생성 후 변경할 수 없게 하고, 객체 출력 시 DB 연결 주소를 숨깁니다.
@dataclass(frozen=True)
class Settings:
    database_url: str = field(repr=False)


# DB 설정을 읽고 연결 주소를 검증한 뒤, 결과를 캐시해 재사용합니다.
@lru_cache
def get_settings() -> Settings:
    """프로세스 환경변수를 우선하며 연결 문자열을 오류에 노출하지 않습니다."""
    # 같은 키가 있으면 오른쪽의 프로세스 환경변수가 .env 값보다 우선합니다.
    values = dotenv_values(PROJECT_ROOT / ".env") | dict(os.environ)
    database_url = values.get("DATABASE_URL")
    if not database_url:
        raise ValueError("DATABASE_URL을 .env 또는 환경변수에 설정하세요.")

    # 주소를 파싱하며, 실패해도 원래 주소가 예외 체인에 노출되지 않게 합니다.
    try:
        url = make_url(database_url)
    except ArgumentError:
        raise ValueError("DATABASE_URL 형식이 올바르지 않습니다.") from None

    # 비동기 PostgreSQL 드라이버와 DB 이름이 지정되어 있는지 확인합니다.
    if url.drivername != "postgresql+asyncpg" or not url.database:
        raise ValueError("DB 이름이 있는 postgresql+asyncpg 연결 주소가 필요합니다.")
    return Settings(database_url=database_url)
