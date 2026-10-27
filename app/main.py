from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.clients import router as clients_router
from app.api.sites import router as sites_router
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
app.include_router(clients_router)
app.include_router(sites_router)
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
