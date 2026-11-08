"""로컬 OAuth 인증과 Search Console의 첫 API 호출을 검증한다."""

from __future__ import annotations

import argparse
import json
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from dotenv import dotenv_values
from google.auth.transport.requests import AuthorizedSession, Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = (
    "https://www.googleapis.com/auth/webmasters",
    "https://www.googleapis.com/auth/siteverification.verify_only",
)
SITES_ENDPOINT = "https://www.googleapis.com/webmasters/v3/sites"
TARGET_SITE = "https://otteru.vercel.app/"
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"


@dataclass(frozen=True)
class Settings:
    client_file: Path
    token_file: Path


def load_settings(root: Path) -> Settings:
    values = dotenv_values(root / ".env")
    secrets_dir = (root / ".secrets").resolve()

    def credential_path(name: str) -> Path:
        value = values.get(name)
        if not value:
            raise ValueError(".env의 Google 인증파일 경로가 필요합니다.")

        path = (root / value).resolve()
        if not path.is_relative_to(secrets_dir):
            raise ValueError("인증파일은 .secrets 폴더 안에 저장해야 합니다.")

        return path

    return Settings(
        client_file=credential_path("GOOGLE_OAUTH_CLIENT_FILE"),
        token_file=credential_path("GOOGLE_TOKEN_FILE"),
    )


def validate_client(data: dict[str, Any]) -> None:
    client = data.get("installed")
    if not isinstance(client, dict):
        raise ValueError("데스크톱 앱용 OAuth JSON이 필요합니다.")
    if not all(client.get(field) for field in ("client_id", "client_secret")):
        raise ValueError("OAuth JSON의 필수 항목이 없습니다.")
    if client.get("auth_uri") not in (
        "https://accounts.google.com/o/oauth2/auth",
        "https://accounts.google.com/o/oauth2/v2/auth",
    ) or client.get("token_uri") != GOOGLE_TOKEN_ENDPOINT:
        raise ValueError("Google 공식 인증 엔드포인트가 아닙니다.")


def save_token(path: Path, content: str) -> None:
    """토큰은 소유자만 읽도록 원자적으로 저장한다."""
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)

    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=path.parent, delete=False
    ) as temporary:
        temporary_path = Path(temporary.name)

        try:
            temporary.write(content)
            temporary.flush()
            os.fsync(temporary.fileno())
            os.replace(temporary_path, path)
        finally:
            temporary_path.unlink(missing_ok=True)


def existing_credentials(settings: Settings) -> Credentials:
    if not settings.token_file.is_file():
        raise ValueError("먼저 auth 명령으로 로그인·동의를 진행하세요.")

    data = json.loads(settings.token_file.read_text(encoding="utf-8"))
    if data.get("token_uri") != GOOGLE_TOKEN_ENDPOINT:
        raise ValueError("토큰 파일의 인증 엔드포인트를 확인해야 합니다.")

    credentials = Credentials.from_authorized_user_info(data)
    if not credentials.has_scopes(SCOPES):
        raise ValueError("요청 권한이 부족합니다. 기존 인증 범위를 확인하세요.")

    if credentials.expired and credentials.refresh_token:
        credentials.refresh(Request())
        save_token(settings.token_file, credentials.to_json())

    if not credentials.valid:
        raise ValueError("유효한 Google 인증이 필요합니다.")

    return credentials


def authenticate(settings: Settings) -> None:
    if settings.token_file.exists():
        existing_credentials(settings)
        print("기존 Google 인증을 확인했습니다. 토큰 값은 출력하지 않습니다.")
        return

    data = json.loads(settings.client_file.read_text(encoding="utf-8"))

    validate_client(data)

    flow = InstalledAppFlow.from_client_config(
        data, scopes=SCOPES, autogenerate_code_verifier=True
    )
    # 브라우저는 사용자 동의에만 사용하고 API 기능은 HTTP로 검증한다.
    credentials = flow.run_local_server(
        host="127.0.0.1",
        port=0,
        open_browser=False,
        authorization_prompt_message="GOOGLE_OAUTH_URL={url}",
        success_message="인증 응답을 받았습니다. 터미널의 토큰 발급 결과를 확인하세요.",
        timeout_seconds=600,
        prompt="consent",
    )
    if not credentials.has_scopes(SCOPES):
        raise ValueError("필요한 권한이 승인되지 않아 토큰을 저장하지 않았습니다.")

    save_token(settings.token_file, credentials.to_json())
    print("Google 인증 완료. 토큰을 .secrets 폴더에 저장했습니다.")


def summarize_sites(data: dict[str, Any], status: int) -> dict[str, Any]:
    entries = data.get("siteEntry", ()) if status == 200 else ()
    matches = tuple(
        {"siteUrl": entry.get("siteUrl"), "permissionLevel": entry.get("permissionLevel")}
        for entry in entries
        if isinstance(entry, dict) and entry.get("siteUrl") == TARGET_SITE
    )

    return {
        "operation": "google.sites.list",
        "http_status": status,
        "api_request_succeeded": status == 200,
        "target_site": TARGET_SITE,
        "target_matches": matches,
        "note": "사이트 목록 조회는 색인 여부 조회가 아닙니다.",
    }


def list_sites(settings: Settings) -> int:
    credentials = existing_credentials(settings)

    with AuthorizedSession(credentials) as session:
        response = session.get(SITES_ENDPOINT, timeout=30)
        data = response.json() if response.content else {}

    summary = summarize_sites(data, response.status_code)

    print(json.dumps(summary, ensure_ascii=False, indent=2))

    return 0 if response.status_code == 200 else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)

    parser.add_argument("command", choices=("auth", "sites"))

    args = parser.parse_args()

    try:
        settings = load_settings(Path(__file__).resolve().parent)

        if args.command == "auth":
            authenticate(settings)
            return 0

        return list_sites(settings)
    except Exception as error:
        # 예외 본문에는 인증 URL·코드·토큰이 포함될 수 있어 종류만 출력한다.
        print(f"실행 실패 ({type(error).__name__}). 인증 설정과 승인 상태를 확인하세요.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
