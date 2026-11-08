"""인증정보 유출 방지와 조회 결과 해석을 확인한다."""

import json
import stat
from pathlib import Path

import pytest

from google_probe import load_settings, save_token, summarize_sites, validate_client


def test_credentials_cannot_leave_secrets_directory(tmp_path: Path) -> None:
    (tmp_path / ".env").write_text(
        "GOOGLE_OAUTH_CLIENT_FILE=public/client.json\n"
        "GOOGLE_TOKEN_FILE=.secrets/token.json\n"
    )

    with pytest.raises(ValueError, match=".secrets"):
        load_settings(tmp_path)


def test_non_google_token_endpoint_is_rejected() -> None:
    with pytest.raises(ValueError, match="Google 공식"):
        validate_client(
            {"installed": {
                "client_id": "test-client",
                "client_secret": "test-secret",
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://example.com/token",
            }}
        )


def test_saved_token_is_private_even_when_replacing_existing_file(tmp_path: Path) -> None:
    path = tmp_path / "token.json"

    path.write_text("old")
    path.chmod(0o644)
    save_token(path, '{"token":"test-only"}')
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert json.loads(path.read_text()) == {"token": "test-only"}


def test_sites_summary_excludes_other_sites_and_error_body() -> None:
    data = {"siteEntry": [
        {"siteUrl": "https://otteru.vercel.app/", "permissionLevel": "siteOwner"},
        {"siteUrl": "https://private.example/", "permissionLevel": "siteOwner"},
    ]}
    summary = summarize_sites(data, 200)

    assert len(summary["target_matches"]) == 1
    assert "private.example" not in json.dumps(summary)

    failure = summarize_sites({"error": {"message": "test-secret"}}, 403)

    assert failure["api_request_succeeded"] is False
    assert "test-secret" not in json.dumps(failure)
