from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.clients import router as clients_router
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


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
