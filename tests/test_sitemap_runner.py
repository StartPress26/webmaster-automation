"""사이트맵 제출의 스레드·인증·자원 정리와 서비스 경계를 검증합니다."""

import threading
from pathlib import Path
from types import SimpleNamespace
from typing import Literal, cast
from unittest.mock import AsyncMock, MagicMock, Mock
from uuid import uuid4

import pytest

from app.engines import sitemap as runner
from app.core.secret_loader import SecretFileError
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
    def submit(site_url: str, sitemap_url: str, reference: str) -> bool:
        assert threading.get_ident() != main_thread
        assert (site_url, sitemap_url) == ("https://example.com/", "https://example.com/sitemap.xml")
        assert reference == "google/account.json"
        return True

    monkeypatch.setattr(runner, "_submit_google", submit)
    assert await runner.submit_sitemap("google", "https://example.com/", "https://example.com/sitemap.xml", "google/account.json")


# 인증 로드 실패의 원본 메시지는 외부로 전달하지 않습니다.
async def test_google_auth_sanitized(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(runner, "load_credentials", Mock(side_effect=GoogleAuthError("secret-token")))

    with pytest.raises(GoogleEngineError) as error:
        await runner.submit_sitemap("google", "https://example.com/", "https://example.com/sitemap.xml", "google/account.json")

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

    loader = Mock()
    monkeypatch.setattr(runner, "load_credentials", loader)
    monkeypatch.setattr(runner, "GoogleEngine", Mock(return_value=adapter))

    if fail:
        with pytest.raises(GoogleEngineError):
            await runner.submit_sitemap("google", "https://example.com/", "https://example.com/sitemap.xml", "google/account.json")
    else:
        assert await runner.submit_sitemap("google", "https://example.com/", "https://example.com/sitemap.xml", "google/account.json")

    adapter.__exit__.assert_called_once()
    loader.assert_called_once_with(secret_reference="google/account.json")


# Bing 제출 성공과 실패 모두 HTTP 클라이언트를 종료합니다.
@pytest.mark.parametrize("fail", [False, True])
async def test_bing_cleanup(monkeypatch: pytest.MonkeyPatch, fail: bool) -> None:
    monkeypatch.setenv("BING_API_KEY", "wrong-global-key")
    monkeypatch.setattr(runner, "load_secret_json", Mock(return_value={"api_key": "test-key"}))

    adapter = Mock(submit_sitemap=AsyncMock(return_value=True))

    if fail:
        adapter.submit_sitemap.side_effect = BingEngineError("timeout", "시간 초과")

    factory = Mock(return_value=adapter)

    monkeypatch.setattr(runner, "BingEngine", factory)

    if fail:
        with pytest.raises(BingEngineError):
            await runner.submit_sitemap("bing", "https://example.com/", "https://example.com/sitemap.xml", "bing/account.json")
    else:
        assert await runner.submit_sitemap("bing", "https://example.com/", "https://example.com/sitemap.xml", "bing/account.json")

    assert factory.call_args.kwargs["http_client"].is_closed
    assert factory.call_args.kwargs["api_key"] == "test-key"
    adapter.submit_sitemap.assert_awaited_once_with("https://example.com/", "https://example.com/sitemap.xml")


# 외부 제출 전 DB 트랜잭션을 닫고 잘못된 접수 결과를 성공으로 응답하지 않습니다.
@pytest.mark.parametrize("accepted", [True, False, None])
async def test_transaction_closed_before_submit(accepted: bool | None) -> None:
    session = MagicMock()
    transaction = session.begin.return_value
    session.scalar = AsyncMock(side_effect=[
        SimpleNamespace(is_active=True, url="https://example.com/", google_account_email="user@example.com"),
        SimpleNamespace(google_secret_ref="google/account.json"),
    ])

    # 외부 호출이 시작될 때 조회 컨텍스트가 이미 종료됐어야 합니다.
    async def submit(engine: str, site_url: str, sitemap_url: str, reference: str) -> bool:
        transaction.__aexit__.assert_awaited_once()
        assert not session.commit.called
        assert reference == "google/account.json"
        return cast(bool, accepted)

    request = SitemapCreate(engine="google", sitemap_url="https://example.com/sitemap.xml")

    if accepted:
        result = await submit_sitemap(session, uuid4(), request, submitter=submit)
        assert result.status == "accepted"
    else:
        with pytest.raises(SitemapError) as error:
            await submit_sitemap(session, uuid4(), request, submitter=submit)
        assert error.value.http_status == 502


# 파일 오류가 나면 전역 Bing 키로 대체하지 않고 제출 전에 중단합니다.
@pytest.mark.parametrize("code", ["invalid_path", "file_unreadable", "invalid_json"])
async def test_bing_secret_file_error(
    monkeypatch: pytest.MonkeyPatch, code: Literal["invalid_path", "file_unreadable", "invalid_json"],
) -> None:
    monkeypatch.setenv("BING_API_KEY", "global-secret")
    monkeypatch.setattr(runner, "load_secret_json", Mock(side_effect=SecretFileError(code)))
    factory = Mock()
    monkeypatch.setattr(runner, "BingEngine", factory)

    with pytest.raises(BingEngineError) as caught:
        await runner.submit_sitemap("bing", "https://example.com/", "https://example.com/sitemap.xml", "bing/private.json")
    assert caught.value.code == "authentication"
    assert "private.json" not in str(caught.value)
    assert "global-secret" not in str(caught.value)
    factory.assert_not_called()


# 잘못된 키 형식과 빈 키는 HTTP 요청 전에 인증 오류로 처리합니다.
@pytest.mark.parametrize("data", [{}, {"api_key": None}, {"api_key": 123}, {"api_key": ""}, {"api_key": "bad key"}])
async def test_bing_invalid_key(monkeypatch: pytest.MonkeyPatch, data: dict[str, object]) -> None:
    monkeypatch.setattr(runner, "load_secret_json", Mock(return_value=data))
    with pytest.raises(BingEngineError) as caught:
        await runner.submit_sitemap("bing", "https://example.com/", "https://example.com/sitemap.xml", "bing/account.json")
    assert caught.value.code == "authentication"


# 선택한 엔진의 계정·참조 누락은 제출 함수를 호출하지 않고 안전하게 구분합니다.
@pytest.mark.parametrize("missing, expected", [
    ("link", "AUTH_ACCOUNT_NOT_LINKED"), ("account", "AUTH_ACCOUNT_NOT_FOUND"),
    ("reference", "SECRET_REFERENCE_NOT_FOUND"),
])
@pytest.mark.parametrize("engine", ["google", "bing"])
async def test_missing_auth_configuration(missing: str, expected: str, engine: str) -> None:
    site = SimpleNamespace(
        is_active=True, url="https://example.com/",
        google_account_email=None if missing == "link" and engine == "google" else "google@example.com",
        bing_account_email=None if missing == "link" and engine == "bing" else "bing@example.com",
    )
    account = None if missing == "account" else SimpleNamespace(google_secret_ref=None, bing_secret_ref=None)
    session = MagicMock()
    session.scalar = AsyncMock(side_effect=[site, account])
    submitter = AsyncMock()

    with pytest.raises(SitemapError) as caught:
        await submit_sitemap(session, uuid4(), SitemapCreate(
            engine=engine, sitemap_url="https://example.com/sitemap.xml",
        ), submitter=submitter)
    assert caught.value.code == expected
    assert caught.value.http_status == 503
    assert "@example.com" not in str(caught.value)
    submitter.assert_not_awaited()


# 검사와 사이트맵을 동시에 실행해도 동일한 Google 파일의 토큰은 한 번만 갱신합니다.
async def test_google_refresh_shared_with_inspection(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import asyncio
    import json
    from datetime import datetime, timedelta, timezone
    from functools import partial

    from google.oauth2.credentials import Credentials

    from app.engines import inspection
    from app.engines.google.google_auth import SCOPES, TOKEN_ENDPOINT, load_credentials

    path = tmp_path / ".secrets" / "google" / "account.json"
    path.parent.mkdir(parents=True)
    path.write_text(Credentials(
        token="expired", refresh_token="test-refresh", token_uri=TOKEN_ENDPOINT,
        client_id="test-client", client_secret="test-secret", scopes=SCOPES,
        expiry=datetime(2000, 1, 1),
    ).to_json())
    refresh_mock = Mock()

    # 실제 Google 요청 없이 토큰 갱신을 재현합니다.
    def refresh(credentials: Credentials, request: object) -> None:
        refresh_mock()
        credentials.token = "renewed-token"
        credentials.expiry = (datetime.now(timezone.utc) + timedelta(hours=1)).replace(tzinfo=None)

    monkeypatch.setattr(Credentials, "refresh", refresh)
    loader = partial(load_credentials, root=tmp_path)
    monkeypatch.setattr(runner, "load_credentials", loader)
    monkeypatch.setattr(inspection, "load_credentials", loader)

    # 인증 이후의 조회와 제출은 모의 세션으로 처리합니다.
    def engine(credentials: Credentials) -> MagicMock:
        adapter = MagicMock()
        adapter.__enter__.return_value = adapter
        adapter.inspect_url.return_value = credentials.token
        adapter.submit_sitemap.return_value = True
        return adapter

    monkeypatch.setattr(runner, "GoogleEngine", engine)
    monkeypatch.setattr(inspection, "GoogleEngine", engine)
    results = await asyncio.gather(
        inspection.inspect_url("google", "https://example.com/", "https://example.com/post", "google/account.json"),
        runner.submit_sitemap("google", "https://example.com/", "https://example.com/sitemap.xml", "google/account.json"),
    )
    assert results == ["renewed-token", True]
    refresh_mock.assert_called_once()
    assert json.loads(path.read_text())["token"] == "renewed-token"
