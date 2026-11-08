"""기존 Google·Bing 어댑터에 사이트맵 제출만 위임합니다."""

import os
from collections.abc import Awaitable, Callable

import httpx
from dotenv import dotenv_values
from starlette.concurrency import run_in_threadpool

from app.core.config import PROJECT_ROOT
from app.engines.bing import BingEngine
from app.engines.google.google import GoogleEngine, GoogleEngineError
from app.engines.google.google_auth import GoogleAuthError, load_credentials
from app.engines.inspection import _google_credentials_lock
from app.schemas.sitemap import SitemapEngine

SitemapSubmitter = Callable[[SitemapEngine, str, str], Awaitable[bool]]


# 상태 검사와 같은 잠금으로 토큰 갱신을 보호하고 Google 세션을 정리합니다.
def _submit_google(site_url: str, sitemap_url: str) -> bool:
    try:
        with _google_credentials_lock:
            credentials = load_credentials()
    except GoogleAuthError:
        raise GoogleEngineError("authentication", "Google 인증 설정을 확인하세요.") from None

    with GoogleEngine(credentials) as engine:
        return engine.submit_sitemap(site_url, sitemap_url)


# Google 동기 요청은 스레드에서 실행하고 Bing 클라이언트는 요청 후 닫습니다.
async def submit_sitemap(engine: SitemapEngine, site_url: str, sitemap_url: str) -> bool:
    if engine == "google":
        return await run_in_threadpool(_submit_google, site_url, sitemap_url)

    values = dotenv_values(PROJECT_ROOT / ".env") | dict(os.environ)

    async with httpx.AsyncClient() as client:
        adapter = BingEngine(api_key=values.get("BING_API_KEY") or "", http_client=client)
        return await adapter.submit_sitemap(site_url, sitemap_url)
