from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.auth_accounts import router as auth_accounts_router
from app.api.clients import router as clients_router
from app.api.dashboard import router as dashboard_router
from app.api.indexnow_settings import router as indexnow_settings_router
from app.api.sites import router as sites_router
from app.api.pages import router as pages_router
from app.api.inspections import router as inspections_router
from app.api.sitemaps import router as sitemaps_router
from app.core.database import dispose_database


# 비동기 리소스의 시작과 종료를 하나의 함수에서 관리합니다.
@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    try:
        yield
    finally:
        # DB 종료
        await dispose_database()


app = FastAPI(title="StartPress Admin", lifespan=lifespan)
# 인증 계정의 이메일·비밀파일 참조를 등록하고 공개 가능한 연결 정보만 조회합니다.
app.include_router(auth_accounts_router)
# 고객사를 등록하고 목록을 조회합니다.
app.include_router(clients_router)
# 선택한 고객사의 블로그·글·엔진별 저장 상태 통계를 조회합니다.
app.include_router(dashboard_router)
# 메인 사이트 정보를 등록하고 고객사별 사이트 목록을 조회합니다.
app.include_router(sites_router)
# 메인 사이트의 네이버·Bing 공통 IndexNow 키 설정을 조회·변경합니다.
app.include_router(indexnow_settings_router)
# 메인 사이트에 속한 글을 저장·조회하고, 저장 시 선택적으로 IndexNow 알림을 보냅니다.
app.include_router(pages_router)
# Google·Bing 상태를 새로 검사하고, DB에 저장된 엔진별 최신 결과를 조회합니다.
app.include_router(inspections_router)
# sitemap 제출
app.include_router(sitemaps_router)
STATIC_DIR = Path(__file__).resolve().parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# 팀원이 고객사와 사이트를 등록할 수 있는 관리 화면을 제공합니다.
@app.get("/", response_class=FileResponse, include_in_schema=False)
def admin_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


# 앱의 실행 상태를 반환합니다.
@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
