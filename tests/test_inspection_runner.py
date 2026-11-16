"""실제 엔진 연결의 스레드 실행·인증 오류·클라이언트 정리를 검증합니다."""

import threading
from pathlib import Path
from typing import Literal
from unittest.mock import AsyncMock, Mock

import pytest

from app.engines import inspection as runner
from app.core.secret_loader import SecretFileError, load_secret_json
from app.engines.bing import BingEngineError
from app.engines.google.google import GoogleEngineError
from app.engines.google.google_auth import GoogleAuthError

pytestmark = pytest.mark.anyio


# 프로젝트의 asyncio 백엔드를 사용합니다.
@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


# Google 동기 작업은 이벤트 루프와 다른 스레드에서 실행돼야 합니다.
async def test_google_runs_in_worker(monkeypatch: pytest.MonkeyPatch) -> None:
    main_thread = threading.get_ident()
    result = Mock()

    # 이벤트 루프 스레드를 막는 직접 호출을 탐지합니다.
    def inspect(site_url: str, page_url: str, reference: str) -> object:
        assert threading.get_ident() != main_thread
        assert (site_url, page_url) == ("https://example.com/", "https://example.com/post")
        assert reference == "google/account.json"
        return result

    monkeypatch.setattr(runner, "_inspect_google", inspect)
    assert await runner.inspect_url("google", "https://example.com/", "https://example.com/post", "google/account.json") is result


# 인증 오류 원문이 밖으로 전달되지 않고 인증 실패로 분류돼야 합니다.
async def test_google_auth_error_is_sanitized(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(runner, "load_credentials", Mock(side_effect=GoogleAuthError("secret-token")))

    with pytest.raises(GoogleEngineError) as error:
        await runner.inspect_url("google", "https://example.com/", "https://example.com/post", "google/account.json")

    assert error.value.code == "authentication"
    assert "secret-token" not in str(error.value)


# 인증 갱신 실패의 공개 코드가 서비스 경계까지 유지되어야 합니다.
async def test_google_auth_reason_is_preserved(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.inspection import _public_error

    monkeypatch.setattr(runner, "load_credentials", Mock(side_effect=GoogleAuthError("secret-token", code="refresh_failed")))

    with pytest.raises(GoogleEngineError) as error:
        await runner.inspect_url("google", "https://example.com/", "https://example.com/post", "google/account.json")

    public = _public_error(error.value)

    assert public.code == "GOOGLE_AUTH_REFRESH_FAILED"
    assert "갱신" in str(public)
    assert "secret-token" not in str(public)


# Google 세션은 검사 성공과 실패 모두 닫혀야 합니다.
@pytest.mark.parametrize("fail", [False, True])
async def test_google_session_cleanup(monkeypatch: pytest.MonkeyPatch, fail: bool) -> None:
    from unittest.mock import MagicMock

    credentials = Mock()
    adapter = MagicMock()
    adapter.__enter__.return_value = adapter

    if fail:
        adapter.inspect_url.side_effect = GoogleEngineError("timeout", "시간 초과")

    loader = Mock(return_value=credentials)
    monkeypatch.setattr(runner, "load_credentials", loader)

    factory = Mock(return_value=adapter)

    monkeypatch.setattr(runner, "GoogleEngine", factory)

    if fail:
        with pytest.raises(GoogleEngineError):
            await runner.inspect_url("google", "https://example.com/", "https://example.com/post", "google/account.json")
    else:
        await runner.inspect_url("google", "https://example.com/", "https://example.com/post", "google/account.json")

    loader.assert_called_once_with(secret_reference="google/account.json")
    factory.assert_called_once_with(credentials)
    adapter.__exit__.assert_called_once()


# Bing 전용 클라이언트는 모의 검사 호출 후 항상 닫힙니다.
async def test_bing_client_cleanup(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BING_API_KEY", "wrong-global-key")
    loader = Mock(return_value={"api_key": "test-key"})
    monkeypatch.setattr(runner, "load_secret_json", loader)

    result = Mock()
    adapter = Mock(inspect_url=AsyncMock(return_value=result))
    factory = Mock(return_value=adapter)

    monkeypatch.setattr(runner, "BingEngine", factory)
    assert await runner.inspect_url("bing", "https://example.com/", "https://example.com/post", "bing/account.json") is result
    loader.assert_called_once_with("bing/account.json")
    assert factory.call_args.kwargs["api_key"] == "test-key"
    assert factory.call_args.kwargs["http_client"].is_closed
    adapter.inspect_url.assert_awaited_once_with("https://example.com/", "https://example.com/post")


# Bing 파일 누락이나 형식 오류는 전역 키로 대체하지 않고 안전한 인증 오류를 반환합니다.
@pytest.mark.parametrize("code", ["invalid_path", "file_unreadable", "invalid_json"])
async def test_bing_secret_file_error(
    monkeypatch: pytest.MonkeyPatch, code: Literal["invalid_path", "file_unreadable", "invalid_json"],
) -> None:
    monkeypatch.setenv("BING_API_KEY", "global-secret")
    monkeypatch.setattr(runner, "load_secret_json", Mock(side_effect=SecretFileError(code)))
    factory = Mock()
    monkeypatch.setattr(runner, "BingEngine", factory)

    with pytest.raises(BingEngineError) as caught:
        await runner.inspect_url("bing", "https://example.com/", "https://example.com/post", "bing/private.json")
    assert caught.value.code == "authentication"
    assert "private.json" not in str(caught.value)
    assert "global-secret" not in str(caught.value)
    factory.assert_not_called()


# 문자열이 아닌 키나 비어 있는 키는 실제 어댑터가 HTTP 요청 전에 거부합니다.
@pytest.mark.parametrize("data", [{}, {"api_key": None}, {"api_key": 123}, {"api_key": ""}, {"api_key": "bad key"}])
async def test_bing_invalid_key(monkeypatch: pytest.MonkeyPatch, data: dict[str, object]) -> None:
    monkeypatch.setattr(runner, "load_secret_json", Mock(return_value=data))
    with pytest.raises(BingEngineError) as caught:
        await runner.inspect_url("bing", "https://example.com/", "https://example.com/post", "bing/account.json")
    assert caught.value.code == "authentication"


# 두 계정의 파일을 병렬로 읽어도 키가 섞이거나 전역 키를 사용하지 않습니다.
async def test_bing_accounts_are_isolated(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import asyncio
    import json

    for name in ("a", "b"):
        (tmp_path / f"{name}.json").write_text(json.dumps({"api_key": f"test-key-{name}"}))

    # 테스트 폴더의 모의 키만 공통 로더로 읽습니다.
    def load(reference: str) -> dict[str, object]:
        return load_secret_json(reference, secrets_root=tmp_path)

    monkeypatch.setattr(runner, "load_secret_json", load)
    monkeypatch.setenv("BING_API_KEY", "wrong-global-key")
    # 각 클라이언트에 주입된 키를 반환해 요청 간 혼용을 확인합니다.
    def engine(api_key: str, http_client: object) -> Mock:
        return Mock(inspect_url=AsyncMock(return_value=api_key))

    factory = Mock(side_effect=engine)
    monkeypatch.setattr(runner, "BingEngine", factory)

    results = await asyncio.gather(*(
        runner.inspect_url("bing", "https://example.com/", "https://example.com/post", f"{name}.json")
        for name in ("a", "b")
    ))
    assert results == ["test-key-a", "test-key-b"]


# 같은 계정의 갱신은 한 번만 수행하고 서로 다른 계정은 자기 파일에 저장합니다.
async def test_google_concurrent_refresh_is_isolated(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import asyncio
    import json
    from datetime import datetime, timedelta, timezone
    from functools import partial
    from unittest.mock import MagicMock

    from google.oauth2.credentials import Credentials

    from app.engines.google.google_auth import SCOPES, TOKEN_ENDPOINT, load_credentials

    directory = tmp_path / ".secrets" / "google"
    directory.mkdir(parents=True)
    for name in ("a", "b"):
        credentials = Credentials(
            token=f"expired-{name}", refresh_token=f"refresh-{name}", token_uri=TOKEN_ENDPOINT,
            client_id="test-client", client_secret="test-secret", scopes=SCOPES,
            expiry=datetime(2000, 1, 1),
        )
        (directory / f"{name}.json").write_text(credentials.to_json())
    refreshed: list[str] = []

    # 실제 HTTP 갱신 대신 계정별 토큰을 만들고 갱신 횟수를 기록합니다.
    def refresh(credentials: Credentials, request: object) -> None:
        refreshed.append(credentials.refresh_token)
        credentials.token = f"renewed-{credentials.refresh_token}"
        credentials.expiry = (datetime.now(timezone.utc) + timedelta(hours=1)).replace(tzinfo=None)

    # 실제 Google 세션 대신 주입된 토큰을 관측 결과로 반환합니다.
    def engine(credentials: Credentials) -> MagicMock:
        adapter = MagicMock()
        adapter.__enter__.return_value = adapter
        adapter.inspect_url.return_value = credentials.token
        return adapter

    monkeypatch.setattr(Credentials, "refresh", refresh)
    monkeypatch.setattr(runner, "load_credentials", partial(load_credentials, root=tmp_path))
    monkeypatch.setattr(runner, "GoogleEngine", engine)
    monkeypatch.setenv("GOOGLE_TOKEN_FILE", ".secrets/wrong-global.json")

    results = await asyncio.gather(*(
        runner.inspect_url("google", "https://example.com/", "https://example.com/post", f"google/{name}.json")
        for name in ("a", "a", "b")
    ))
    assert results == ["renewed-refresh-a", "renewed-refresh-a", "renewed-refresh-b"]
    assert sorted(refreshed) == ["refresh-a", "refresh-b"]
    for name in ("a", "b"):
        assert json.loads((directory / f"{name}.json").read_text())["token"] == f"renewed-refresh-{name}"
