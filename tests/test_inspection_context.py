"""실제 DB 없이 부모 사이트의 계정 선택과 인증 연결 누락을 검증합니다."""

from typing import Literal
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.models.auth_account import AuthAccount
from app.models.site import Site
from app.services.inspection import InspectionUpstreamError, _get_context

pytestmark = pytest.mark.anyio


# 비동기 테스트는 프로젝트의 asyncio 백엔드를 사용합니다.
@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


# 메인 사이트와 계정 없는 개별 글을 준비하고 DB 결과만 대신합니다.
def context_session(kind: str) -> tuple[MagicMock, Site, Site]:
    parent = Site(
        id=uuid4(), client_id=uuid4(), target_type="site", owner_type="internal",
        url="https://example.com/", is_active=True,
        google_account_email="google@example.com", bing_account_email="bing@example.com",
    )
    target = parent if kind == "site" else Site(
        id=uuid4(), parent_site_id=parent.id, client_id=parent.client_id,
        target_type="page", owner_type=parent.owner_type,
        url="https://example.com/post", is_active=True,
    )
    session = MagicMock()
    session.scalar = AsyncMock()
    return session, parent, target


# 글은 부모 계정을 상속하고 메인 사이트는 자기 계정의 엔진별 참조를 조회합니다.
@pytest.mark.parametrize("kind", ["site", "page"])
@pytest.mark.parametrize("engine", ["google", "bing"])
async def test_context_selects_parent_account(kind: str, engine: Literal["google", "bing"]) -> None:
    session, parent, target = context_session(kind)
    account = AuthAccount(
        email=f"{engine}@example.com", google_secret_ref="google/account.json", bing_secret_ref="bing/account.json",
    )
    session.scalar.side_effect = [parent, account] if kind == "site" else [target, parent, account]

    assert await _get_context(session, target.id, engine) == (parent.url, target.url, f"{engine}/account.json")
    query = session.scalar.call_args.args[0].compile()
    assert f"{engine}@example.com" in query.params.values()
    session.begin.return_value.__aexit__.assert_awaited_once()


# 선택한 엔진이 미연결이면 다른 엔진의 계정으로 대신하지 않고 조회를 중단합니다.
@pytest.mark.parametrize("engine", ["google", "bing"])
async def test_missing_link_is_rejected(engine: Literal["google", "bing"]) -> None:
    session, parent, target = context_session("page")
    setattr(parent, f"{engine}_account_email", None)
    session.scalar.side_effect = [target, parent]

    with pytest.raises(InspectionUpstreamError) as caught:
        await _get_context(session, target.id, engine)
    assert caught.value.code == "AUTH_ACCOUNT_NOT_LINKED"
    assert caught.value.http_status == 503
    assert session.scalar.await_count == 2


# 인증 행과 파일 참조 누락을 구분하고 개인 이메일을 오류에 노출하지 않습니다.
@pytest.mark.parametrize("missing", ["account", "reference"])
async def test_missing_auth_configuration(missing: str) -> None:
    session, parent, target = context_session("page")
    account = None if missing == "account" else AuthAccount(email=parent.google_account_email)
    session.scalar.side_effect = [target, parent, account]

    with pytest.raises(InspectionUpstreamError) as caught:
        await _get_context(session, target.id, "google")
    assert caught.value.code == ("AUTH_ACCOUNT_NOT_FOUND" if missing == "account" else "SECRET_REFERENCE_NOT_FOUND")
    assert caught.value.http_status == 503
    assert "google@example.com" not in str(caught.value)
