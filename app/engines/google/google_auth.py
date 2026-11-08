"""저장된 Google OAuth 토큰을 읽고 필요하면 갱신합니다."""

import json
import os
import tempfile
from functools import partial
from pathlib import Path
from typing import Literal

from dotenv import dotenv_values
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from requests import Session

PROJECT_ROOT = Path(__file__).resolve().parents[3]
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
SCOPES = (
    "https://www.googleapis.com/auth/webmasters",
    "https://www.googleapis.com/auth/siteverification.verify_only",
)


GoogleAuthCode = Literal["authentication", "configuration_missing", "invalid_token_path", "token_unreadable", "token_format", "insufficient_scopes", "refresh_token_missing", "refresh_failed", "token_invalid", "token_save_failed"]
AUTH_MESSAGES: dict[str, str] = {
    "authentication": "Google API 인증 설정을 확인하세요.",
    "configuration_missing": "서버에 Google API 토큰 경로가 설정되지 않았습니다.",
    "invalid_token_path": "Google API 토큰의 저장 경로 설정을 확인해야 합니다.",
    "token_unreadable": "저장된 Google API 토큰 파일을 읽을 수 없습니다.",
    "token_format": "저장된 Google API 토큰의 형식이 올바르지 않습니다.",
    "insufficient_scopes": "Google API 연결에 필요한 접근 범위가 없습니다. 로그인·동의를 다시 확인하세요.",
    "refresh_token_missing": "Google API 인증을 갱신할 토큰이 없습니다. 재연결이 필요합니다.",
    "refresh_failed": "Google API 인증 갱신에 실패했습니다. 서버 연결 상태 또는 OAuth 재인증을 확인하세요.",
    "token_invalid": "갱신 후에도 Google API 인증이 유효하지 않습니다.",
    "token_save_failed": "갱신된 Google API 인증정보를 서버에 저장하지 못했습니다.",
}


class GoogleAuthError(Exception):
    """비밀값을 포함하지 않는 Google 인증 오류입니다."""

    # 기존 메시지와 별개로 허용된 원인 코드·공개 메시지만 API에 전달합니다.
    def __init__(self, message: str, *, code: GoogleAuthCode = "authentication") -> None:
        super().__init__(message)
        self.code = code if code in AUTH_MESSAGES else "authentication"
        self.public_message = AUTH_MESSAGES[self.code]


# 환경설정에서 토큰 경로를 읽고 프로젝트의 비공개 폴더 내부인지 확인합니다.
def get_token_path(root: Path) -> Path:
    values = dotenv_values(root / ".env") | dict(os.environ)
    configured = values.get("GOOGLE_TOKEN_FILE")
    if not configured:
        raise GoogleAuthError("GOOGLE_TOKEN_FILE 설정이 필요합니다.", code="configuration_missing")

    path = (root / configured).resolve()
    if not path.is_relative_to((root / ".secrets").resolve()):
        raise GoogleAuthError("토큰 파일은 .secrets 폴더 내부에 있어야 합니다.", code="invalid_token_path")

    return path


# 갱신한 토큰을 소유자만 읽을 수 있는 임시 파일에 쓴 뒤 원자적으로 교체합니다.
def save_credentials(path: Path, credentials: Credentials) -> None:
    temporary_path: Path | None = None

    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent, delete=False
        ) as temporary:
            temporary_path = Path(temporary.name)
            temporary.write(credentials.to_json())
            temporary.flush()
            os.fsync(temporary.fileno())

        os.replace(temporary_path, path)
    except Exception:
        raise GoogleAuthError("갱신된 Google 토큰을 저장하지 못했습니다.", code="token_save_failed") from None
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


# 토큰과 권한을 검증하고, 만료된 토큰은 갱신·저장한 뒤 인증 객체를 반환합니다.
def load_credentials(root: Path = PROJECT_ROOT) -> Credentials:
    path = get_token_path(root)

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise GoogleAuthError("Google 토큰 파일을 읽을 수 없습니다. 최초 인증을 확인하세요.", code="token_unreadable") from None

    if not isinstance(data, dict) or data.get("token_uri") != TOKEN_ENDPOINT:
        raise GoogleAuthError("Google 공식 토큰 엔드포인트가 필요합니다.", code="token_format")

    try:
        credentials = Credentials.from_authorized_user_info(data)
    except Exception:
        raise GoogleAuthError("Google 토큰 파일의 형식이 올바르지 않습니다.", code="token_format") from None

    if not credentials.has_scopes(SCOPES):
        raise GoogleAuthError("Google 접근 권한이 부족합니다. 다시 로그인·동의하세요.", code="insufficient_scopes")

    if not credentials.valid:
        if not credentials.refresh_token:
            raise GoogleAuthError("갱신 토큰이 없습니다. 다시 로그인·동의하세요.", code="refresh_token_missing")

        try:
            with Session() as session:
                credentials.refresh(partial(Request(session=session), timeout=30))
        except Exception:
            # Google 오류 본문에 토큰이 포함될 수 있으므로 원본 예외를 전달하지 않습니다.
            raise GoogleAuthError("Google 토큰 갱신에 실패했습니다. 연결 또는 재인증을 확인하세요.", code="refresh_failed") from None

        if not credentials.valid or not credentials.has_scopes(SCOPES):
            raise GoogleAuthError("갱신된 Google 인증 또는 접근 권한이 유효하지 않습니다.", code="token_invalid")

        save_credentials(path, credentials)

    return credentials
