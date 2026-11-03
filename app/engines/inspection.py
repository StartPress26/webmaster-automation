"""요청한 엔진의 인증과 세션을 준비하고 URL 상태만 조회합니다."""

import os
from collections.abc import Awaitable, Callable
from threading import Lock

import httpx
from dotenv import dotenv_values
from starlette.concurrency import run_in_threadpool

from app.core.config import PROJECT_ROOT
from app.engines.bing import BingEngine, BingUrlInspection
from app.engines.google.google import GoogleEngine, GoogleEngineError, GoogleUrlInspection
from app.engines.google.google_auth import GoogleAuthError, load_credentials
from app.schemas.inspection import InspectionEngine

InspectionResult = GoogleUrlInspection | BingUrlInspection
Inspector = Callable[[InspectionEngine, str, str], Awaitable[InspectionResult]]
_google_credentials_lock = Lock()


# 동기 인증·요청을 한 스레드에서 실행하고 Google 전용 세션을 닫습니다.
def _inspect_google(site_url: str, page_url: str) -> GoogleUrlInspection:
    try:
        # 토큰 갱신 파일을 동시 요청이 서로 덮어쓰지 않게 합니다.
        with _google_credentials_lock:
            credentials = load_credentials()
    except GoogleAuthError:
        raise GoogleEngineError("authentication", "Google 인증 설정을 확인하세요.") from None
    with GoogleEngine(credentials) as engine:
        return engine.inspect_url(site_url, page_url)


# Google은 스레드풀, Bing은 비동기 HTTP로 조회하고 실제 제출 작업은 하지 않습니다.
async def inspect_url(engine: InspectionEngine, site_url: str, page_url: str) -> InspectionResult:
    if engine == "google":
        # thread에서 실행해서 비동기적으로 처리
        return await run_in_threadpool(_inspect_google, site_url, page_url)
    values = dotenv_values(PROJECT_ROOT / ".env") | dict(os.environ)
    async with httpx.AsyncClient() as client:
        adapter = BingEngine(api_key=values.get("BING_API_KEY") or "", http_client=client)
        return await adapter.inspect_url(site_url, page_url)
