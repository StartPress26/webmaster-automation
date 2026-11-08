"""사이트맵 제출의 스레드·인증·자원 정리와 서비스 경계를 검증합니다."""

import threading
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock, MagicMock, Mock
from uuid import uuid4

import pytest

from app.engines import sitemap as runner
from app.engines.bing import BingEngineError
from app.engines.google.google import GoogleEngineError
from app.engines.google.google_auth import GoogleAuthError
from app.schemas.sitemap import SitemapCreate
from app.services.sitemap import SitemapError, submit_sitemap

pytestmark = pytest.mark.anyio


# 테스트 이벤트 루프는 프로젝트의 asyncio를 사용합니다.
@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


# Google 동기 제출은 이벤트 루프가 아닌 작업 스레드에서 실행합니다.
async def test_google_worker(monkeypatch: pytest.MonkeyPatch) -> None:
    main_thread = threading.get_ident()

    # 전달한 주소와 실행 스레드를 검사합니다.
    def submit(site_url: str, sitemap_url: str) -> bool:
        assert threading.get_ident() != main_thread
        assert (site_url, sitemap_url) == ("https://example.com/", "https://example.com/sitemap.xml")
        return True

    monkeypatch.setattr(runner, "_submit_google", submit)
    assert await runner.submit_sitemap("google", "https://example.com/", "https://example.com/sitemap.xml")


# 인증 로드 실패의 원본 메시지는 외부로 전달하지 않습니다.
async def test_google_auth_sanitized(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(runner, "load_credentials", Mock(side_effect=GoogleAuthError("secret-token")))

    with pytest.raises(GoogleEngineError) as error:
        await runner.submit_sitemap("google", "https://example.com/", "https://example.com/sitemap.xml")

    assert error.value.code == "authentication"
    assert "secret-token" not in str(error.value)


# Google 제출 성공과 실패 모두 전용 세션을 종료합니다.
@pytest.mark.parametrize("fail", [False, True])
async def test_google_cleanup(monkeypatch: pytest.MonkeyPatch, fail: bool) -> None:
    adapter = MagicMock()
    adapter.__enter__.return_value = adapter
    adapter.submit_sitemap.return_value = True

    if fail:
        adapter.submit_sitemap.side_effect = GoogleEngineError("timeout", "시간 초과")

    monkeypatch.setattr(runner, "load_credentials", Mock())
    monkeypatch.setattr(runner, "GoogleEngine", Mock(return_value=adapter))

    if fail:
        with pytest.raises(GoogleEngineError):
            await runner.submit_sitemap("google", "https://example.com/", "https://example.com/sitemap.xml")
    else:
        assert await runner.submit_sitemap("google", "https://example.com/", "https://example.com/sitemap.xml")

    adapter.__exit__.assert_called_once()


# Bing 제출 성공과 실패 모두 HTTP 클라이언트를 종료합니다.
@pytest.mark.parametrize("fail", [False, True])
async def test_bing_cleanup(monkeypatch: pytest.MonkeyPatch, fail: bool) -> None:
    monkeypatch.setenv("BING_API_KEY", "test-key")

    adapter = Mock(submit_sitemap=AsyncMock(return_value=True))

    if fail:
        adapter.submit_sitemap.side_effect = BingEngineError("timeout", "시간 초과")

    factory = Mock(return_value=adapter)

    monkeypatch.setattr(runner, "BingEngine", factory)

    if fail:
        with pytest.raises(BingEngineError):
            await runner.submit_sitemap("bing", "https://example.com/", "https://example.com/sitemap.xml")
    else:
        assert await runner.submit_sitemap("bing", "https://example.com/", "https://example.com/sitemap.xml")

    assert factory.call_args.kwargs["http_client"].is_closed
    adapter.submit_sitemap.assert_awaited_once_with("https://example.com/", "https://example.com/sitemap.xml")


# 외부 제출 전 DB 트랜잭션을 닫고 잘못된 접수 결과를 성공으로 응답하지 않습니다.
@pytest.mark.parametrize("accepted", [True, False, None])
async def test_transaction_closed_before_submit(accepted: bool | None) -> None:
    session = MagicMock()
    transaction = session.begin.return_value
    session.scalar = AsyncMock(return_value=SimpleNamespace(is_active=True, url="https://example.com/"))

    # 외부 호출이 시작될 때 조회 컨텍스트가 이미 종료됐어야 합니다.
    async def submit(engine: str, site_url: str, sitemap_url: str) -> bool:
        transaction.__aexit__.assert_awaited_once()
        assert not session.commit.called
        return cast(bool, accepted)

    request = SitemapCreate(engine="google", sitemap_url="https://example.com/sitemap.xml")

    if accepted:
        result = await submit_sitemap(session, uuid4(), request, submitter=submit)
        assert result.status == "accepted"
    else:
        with pytest.raises(SitemapError) as error:
            await submit_sitemap(session, uuid4(), request, submitter=submit)
        assert error.value.http_status == 502
