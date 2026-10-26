"""DB 설정 오류가 비밀번호를 노출하지 않는지 확인합니다."""

import pytest
from app.core.config import get_settings


@pytest.mark.parametrize("database_url", [
    "not-a-url-contains-private-value",
    "sqlite:///private-value",
    "postgresql+asyncpg://user:private-value@localhost",
])
def test_invalid_database_url_does_not_expose_value(
    monkeypatch: pytest.MonkeyPatch, database_url: str
) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("DATABASE_URL", database_url)
    try:
        with pytest.raises(ValueError) as error:
            get_settings()
        assert "private-value" not in str(error.value)
    finally:
        get_settings.cache_clear()


def test_settings_repr_does_not_expose_database_password(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv(
        "DATABASE_URL", "postgresql+asyncpg://user:private-value@localhost/test_db"
    )
    try:
        assert "private-value" not in repr(get_settings())
    finally:
        get_settings.cache_clear()
