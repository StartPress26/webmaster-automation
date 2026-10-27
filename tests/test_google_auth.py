"""실제 Google 요청 없이 인증 경계와 토큰 갱신을 검증합니다."""

import json
import stat
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from google.oauth2.credentials import Credentials

from app.engines.google.google_auth import (
    GoogleAuthError,
    SCOPES,
    TOKEN_ENDPOINT,
    load_credentials,
)


# 테스트 전용 OAuth 파일을 만들고 실제 환경설정의 영향을 제거합니다.
@pytest.fixture
def token_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.delenv("GOOGLE_TOKEN_FILE", raising=False)
    (tmp_path / ".env").write_text("GOOGLE_TOKEN_FILE=.secrets/token.json\n")
    path = tmp_path / ".secrets" / "token.json"
    path.parent.mkdir()
    credentials = Credentials(
        token="test-access", refresh_token="test-refresh", token_uri=TOKEN_ENDPOINT,
        client_id="test-client", client_secret="test-secret", scopes=SCOPES,
        expiry=(datetime.now(timezone.utc) + timedelta(hours=1)).replace(tzinfo=None),
    )
    path.write_text(credentials.to_json())
    return path


# 유효한 토큰은 네트워크 갱신 없이 재사용합니다.
def test_valid_token_is_reused(token_file: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # 예상하지 않은 갱신 요청이 발생하면 테스트를 실패시킵니다.
    def reject_refresh(*args: object, **kwargs: object) -> None:
        pytest.fail("유효한 토큰을 갱신하면 안 됩니다.")

    monkeypatch.setattr(Credentials, "refresh", reject_refresh)
    assert load_credentials(token_file.parents[1]).valid


# 만료된 토큰은 갱신하고 비공개 파일로 저장합니다.
def test_expired_token_is_refreshed(token_file: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    data = json.loads(token_file.read_text()) | {"expiry": "2000-01-01T00:00:00Z"}
    token_file.write_text(json.dumps(data))

    # Google 라이브러리가 인증 객체를 갱신하는 동작을 대신합니다.
    def refresh(credentials: Credentials, request: object) -> None:
        credentials.token = "test-renewed"
        credentials.expiry = (datetime.now(timezone.utc) + timedelta(hours=1)).replace(tzinfo=None)

    monkeypatch.setattr(Credentials, "refresh", refresh)
    assert load_credentials(token_file.parents[1]).valid
    assert json.loads(token_file.read_text())["token"] == "test-renewed"
    assert stat.S_IMODE(token_file.stat().st_mode) == 0o600


# 외부 인증 서버와 누락된 권한은 네트워크 호출 전에 거부합니다.
@pytest.mark.parametrize("change", [{"token_uri": "https://example.com/token"}, {"scopes": []}])
def test_invalid_credentials_are_rejected(token_file: Path, change: dict[str, object]) -> None:
    token_file.write_text(json.dumps(json.loads(token_file.read_text()) | change))
    with pytest.raises(GoogleAuthError):
        load_credentials(token_file.parents[1])


# 비공개 폴더 밖의 토큰 경로는 거부합니다.
def test_outside_path_is_rejected(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_TOKEN_FILE", "public/token.json")
    with pytest.raises(GoogleAuthError, match=".secrets"):
        load_credentials(tmp_path)


# 갱신 실패 시 비밀값과 원본 예외를 외부에 전달하거나 기존 파일을 바꾸지 않습니다.
def test_refresh_failure_is_sanitized(token_file: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    original = json.dumps(json.loads(token_file.read_text()) | {"expiry": "2000-01-01T00:00:00Z"})
    token_file.write_text(original)

    # 비밀값이 포함된 외부 오류를 재현합니다.
    def refresh(*args: object, **kwargs: object) -> None:
        raise RuntimeError("test-secret")

    monkeypatch.setattr(Credentials, "refresh", refresh)
    with pytest.raises(GoogleAuthError) as caught:
        load_credentials(token_file.parents[1])
    assert "test-secret" not in str(caught.value)
    assert caught.value.__suppress_context__
    assert token_file.read_text() == original
