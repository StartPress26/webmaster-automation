"""저장된 Google OAuth 토큰을 읽고 필요하면 갱신합니다."""

import json
import os
import tempfile
from functools import partial
from pathlib import Path

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


class GoogleAuthError(Exception):
    """비밀값을 포함하지 않는 Google 인증 오류입니다."""


# 환경설정에서 토큰 경로를 읽고 프로젝트의 비공개 폴더 내부인지 확인합니다.
def get_token_path(root: Path) -> Path:
    values = dotenv_values(root / ".env") | dict(os.environ)
    configured = values.get("GOOGLE_TOKEN_FILE")
    if not configured:
        raise GoogleAuthError("GOOGLE_TOKEN_FILE 설정이 필요합니다.")
    path = (root / configured).resolve()
    if not path.is_relative_to((root / ".secrets").resolve()):
        raise GoogleAuthError("토큰 파일은 .secrets 폴더 내부에 있어야 합니다.")
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
        raise GoogleAuthError("갱신된 Google 토큰을 저장하지 못했습니다.") from None
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


# 토큰과 권한을 검증하고, 만료된 토큰은 갱신·저장한 뒤 인증 객체를 반환합니다.
def load_credentials(root: Path = PROJECT_ROOT) -> Credentials:
    path = get_token_path(root)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise GoogleAuthError("Google 토큰 파일을 읽을 수 없습니다. 최초 인증을 확인하세요.") from None

    if not isinstance(data, dict) or data.get("token_uri") != TOKEN_ENDPOINT:
        raise GoogleAuthError("Google 공식 토큰 엔드포인트가 필요합니다.")
    try:
        credentials = Credentials.from_authorized_user_info(data)
    except Exception:
        raise GoogleAuthError("Google 토큰 파일의 형식이 올바르지 않습니다.") from None

    if not credentials.has_scopes(SCOPES):
        raise GoogleAuthError("Google 접근 권한이 부족합니다. 다시 로그인·동의하세요.")

    if not credentials.valid:
        if not credentials.refresh_token:
            raise GoogleAuthError("갱신 토큰이 없습니다. 다시 로그인·동의하세요.")
        try:
            with Session() as session:
                credentials.refresh(partial(Request(session=session), timeout=30))
        except Exception:
            # Google 오류 본문에 토큰이 포함될 수 있으므로 원본 예외를 전달하지 않습니다.
            raise GoogleAuthError("Google 토큰 갱신에 실패했습니다. 연결 또는 재인증을 확인하세요.") from None
        if not credentials.valid or not credentials.has_scopes(SCOPES):
            raise GoogleAuthError("갱신된 Google 인증 또는 접근 권한이 유효하지 않습니다.")
        save_credentials(path, credentials)

    return credentials
