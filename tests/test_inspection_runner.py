"""실제 엔진 연결의 스레드 실행·인증 오류·클라이언트 정리를 검증합니다."""

import threading
from unittest.mock import AsyncMock, Mock

import pytest

from app.engines import inspection as runner
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
    def inspect(site_url: str, page_url: str) -> object:
        assert threading.get_ident() != main_thread
        assert (site_url, page_url) == ("https://example.com/", "https://example.com/post")
        return result

    monkeypatch.setattr(runner, "_inspect_google", inspect)
    assert await runner.inspect_url("google", "https://example.com/", "https://example.com/post") is result


# 인증 오류 원문이 밖으로 전달되지 않고 인증 실패로 분류돼야 합니다.
async def test_google_auth_error_is_sanitized(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(runner, "load_credentials", Mock(side_effect=GoogleAuthError("secret-token")))

    with pytest.raises(GoogleEngineError) as error:
        await runner.inspect_url("google", "https://example.com/", "https://example.com/post")

    assert error.value.code == "authentication"
    assert "secret-token" not in str(error.value)


# 인증 갱신 실패의 공개 코드가 서비스 경계까지 유지되어야 합니다.
async def test_google_auth_reason_is_preserved(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.inspection import _public_error

    monkeypatch.setattr(runner, "load_credentials", Mock(side_effect=GoogleAuthError("secret-token", code="refresh_failed")))

    with pytest.raises(GoogleEngineError) as error:
        await runner.inspect_url("google", "https://example.com/", "https://example.com/post")

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

    monkeypatch.setattr(runner, "load_credentials", Mock(return_value=credentials))

    factory = Mock(return_value=adapter)

    monkeypatch.setattr(runner, "GoogleEngine", factory)

    if fail:
        with pytest.raises(GoogleEngineError):
            await runner.inspect_url("google", "https://example.com/", "https://example.com/post")
    else:
        await runner.inspect_url("google", "https://example.com/", "https://example.com/post")

    factory.assert_called_once_with(credentials)
    adapter.__exit__.assert_called_once()


# Bing 전용 클라이언트는 모의 검사 호출 후 항상 닫힙니다.
async def test_bing_client_cleanup(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("BING_API_KEY", raising=False)
    monkeypatch.setattr(runner, "dotenv_values", Mock(return_value={"BING_API_KEY": "test-key"}))

    result = Mock()
    adapter = Mock(inspect_url=AsyncMock(return_value=result))
    factory = Mock(return_value=adapter)

    monkeypatch.setattr(runner, "BingEngine", factory)
    assert await runner.inspect_url("bing", "https://example.com/", "https://example.com/post") is result
    assert factory.call_args.kwargs["api_key"] == "test-key"
    assert factory.call_args.kwargs["http_client"].is_closed
    adapter.inspect_url.assert_awaited_once_with("https://example.com/", "https://example.com/post")
