"""임시 PostgreSQL에서 인증 계정 API와 비밀 참조 노출 방지를 확인합니다."""

from collections.abc import AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.api.auth_accounts import router
from app.core.database import get_db
from app.main import app

pytestmark = [pytest.mark.integration, pytest.mark.anyio]


# 요청별 세션을 SAVEPOINT로 격리하고 테스트가 끝나면 테스트 데이터만 롤백합니다.
@pytest.fixture
async def auth_api(migrated_database_url: str) -> AsyncIterator[AsyncClient]:
    engine = create_async_engine(migrated_database_url, poolclass=NullPool, hide_parameters=True)
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()

            # 요청별 커밋·롤백이 테스트 전체 트랜잭션을 종료하지 않게 합니다.
            async def test_db() -> AsyncIterator[AsyncSession]:
                async with AsyncSession(
                    bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint",
                ) as session:
                    yield session

            application = FastAPI()
            application.include_router(router)
            application.dependency_overrides[get_db] = test_db
            try:
                async with AsyncClient(
                    transport=ASGITransport(app=application), base_url="http://test",
                ) as client:
                    yield client
            finally:
                await transaction.rollback()
    finally:
        await engine.dispose()


# 실제 앱에 등록된 경로와 요청 간 저장·조회 및 응답 필드를 확인합니다.
async def test_create_and_list_auth_accounts(auth_api: AsyncClient) -> None:
    assert set(app.openapi()["paths"]["/auth-accounts"]) >= {"get", "post"}
    assert (await auth_api.get("/auth-accounts")).json() == {"items": []}
    created = await auth_api.post("/auth-accounts", json={
        "email": "user@example.com", "google_secret_ref": "google/a.json",
    })
    assert created.status_code == 201
    assert created.json() == {
        "email": "user@example.com", "google_configured": True, "bing_configured": False,
    }
    listed = await auth_api.get("/auth-accounts")
    assert listed.status_code == 200
    assert listed.json() == {"items": [created.json()]}


# 중복 등록은 기존 연결을 유지하고 고정된 오류 코드만 반환합니다.
async def test_duplicate_auth_account(auth_api: AsyncClient) -> None:
    payload = {"email": "user@example.com", "bing_secret_ref": "bing/original.json"}
    assert (await auth_api.post("/auth-accounts", json=payload)).status_code == 201
    duplicate = await auth_api.post("/auth-accounts", json={"email": "user@example.com"})
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"]["code"] == "AUTH_ACCOUNT_ALREADY_EXISTS"
    assert "original.json" not in duplicate.text
    assert (await auth_api.get("/auth-accounts")).json()["items"][0]["bing_configured"] is True


# 정렬·페이지 분할과 허용 범위를 벗어난 쿼리 거부를 확인합니다.
async def test_pagination(auth_api: AsyncClient) -> None:
    for email in ("z@example.com", "a@example.com"):
        assert (await auth_api.post("/auth-accounts", json={"email": email})).status_code == 201
    page = await auth_api.get("/auth-accounts", params={"limit": 1, "offset": 1})
    assert page.status_code == 200
    assert [item["email"] for item in page.json()["items"]] == ["z@example.com"]
    for params in ({"limit": 0}, {"limit": 101}, {"offset": -1}):
        assert (await auth_api.get("/auth-accounts", params=params)).status_code == 422


# 잘못된 입력을 저장하지 않고 검증 오류에도 입력값·예외 문맥을 포함하지 않습니다.
@pytest.mark.parametrize("payload", [
    {"email": "invalid"},
    {"email": "user@example.com", "google_secret_ref": "../private-token.json"},
    {"email": "user@example.com", "bing_api_key": "accidentally-entered-secret"},
])
async def test_invalid_payload_is_private(auth_api: AsyncClient, payload: dict[str, str]) -> None:
    response = await auth_api.post("/auth-accounts", json=payload)
    assert response.status_code == 422
    for error in response.json()["detail"]:
        assert set(error) == {"loc", "type", "msg"}
    assert "private-token.json" not in response.text
    assert "accidentally-entered-secret" not in response.text
    assert (await auth_api.get("/auth-accounts")).json() == {"items": []}
