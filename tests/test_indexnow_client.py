"""실제 네트워크 없이 IndexNow 제출과 통신 오류 처리를 검증합니다."""

import asyncio
import json
from datetime import datetime, timezone
from unittest.mock import Mock

import httpx
import pytest

from app.engines.indexnow.client import (
    IndexNowClient,
    IndexNowTimeoutError,
    IndexNowTransportError,
)
from app.engines.indexnow.schemas import IndexNowRequest, SubmissionStatus

pytestmark = pytest.mark.anyio


# 다른 비동기 백엔드 설치 없이 프로젝트의 asyncio 환경에서 테스트합니다.
@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


# API 필드명·전송 대상·타임아웃을 확인하고 생략한 키 파일 주소는 보내지 않습니다.
@pytest.mark.parametrize("key_location", [None, "https://example.com/key.txt"])
async def test_submission_payload(key_location: str | None) -> None:
    request = IndexNowRequest(
        host="example.com",
        key="a1b2c3d4e5f67890",
        urls=("https://example.com/post",),
        key_location=key_location,
    )
    handler = Mock(return_value=httpx.Response(200))
    before = datetime.now(timezone.utc)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        result = await IndexNowClient(http_client).submit(request)
        assert not http_client.is_closed

    sent = handler.call_args.args[0]
    expected = {
        "host": request.host,
        "key": request.key,
        "urlList": list(request.urls),
    } | ({"keyLocation": key_location} if key_location is not None else {})

    assert sent.method == "POST"
    assert str(sent.url) == "https://api.indexnow.org/indexnow"
    assert sent.headers["Content-Type"] == "application/json; charset=utf-8"
    assert json.loads(sent.content) == expected
    assert sent.extensions["timeout"] == {
        "connect": 10.0, "read": 30.0, "write": 30.0, "pool": 30.0,
    }
    assert before <= result.requested_at <= datetime.now(timezone.utc)
    handler.assert_called_once()


# JSON이 아닌 오류 본문에서도 HTTP 상태 코드로 접수 결과를 반환합니다.
@pytest.mark.parametrize(
    "http_status, expected",
    [(200, "accepted"), (202, "key_pending"), (400, "failed"),
     (403, "failed"), (422, "failed"), (429, "failed"), (500, "failed")],
)
async def test_response_status(http_status: int, expected: SubmissionStatus) -> None:
    handler = Mock(return_value=httpx.Response(http_status, text="not JSON"))
    request = IndexNowRequest(
        host="example.com", key="a1b2c3d4", urls=("https://example.com/",),
    )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        result = await IndexNowClient(http_client).submit(request)

    assert result.http_status == http_status
    assert result.status == expected
    handler.assert_called_once()


# 자동 리다이렉트를 켠 HTTP 클라이언트에서도 다른 주소로 키를 재전송하지 않습니다.
async def test_redirect_is_not_followed() -> None:
    handler = Mock(return_value=httpx.Response(
        307, headers={"Location": "https://other.test/collect"},
    ))
    request = IndexNowRequest(
        host="example.com", key="a1b2c3d4", urls=("https://example.com/",),
    )

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler), follow_redirects=True,
    ) as http_client:
        result = await IndexNowClient(http_client).submit(request)

    assert result.http_status == 307
    assert result.status == "failed"
    handler.assert_called_once()


# 타임아웃 종류를 하나의 업무 예외로 변환하고 자동 재전송하지 않습니다.
@pytest.mark.parametrize(
    "error_type", [httpx.ConnectTimeout, httpx.ReadTimeout, httpx.WriteTimeout, httpx.PoolTimeout],
)
async def test_timeout_is_distinct(error_type: type[httpx.TimeoutException]) -> None:
    handler = Mock(side_effect=error_type("private-input"))
    request = IndexNowRequest(
        host="example.com", key="a1b2c3d4", urls=("https://example.com/",),
    )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        with pytest.raises(IndexNowTimeoutError) as error:
            await IndexNowClient(http_client).submit(request)

    assert "private-input" not in str(error.value)
    assert error.value.__suppress_context__
    handler.assert_called_once()


# 연결 실패와 프로토콜 오류는 타임아웃과 구분하고 원본 오류 본문을 숨깁니다.
@pytest.mark.parametrize("error_type", [httpx.ConnectError, httpx.RemoteProtocolError])
async def test_transport_error_is_distinct(error_type: type[httpx.RequestError]) -> None:
    handler = Mock(side_effect=error_type("private-input"))
    request = IndexNowRequest(
        host="example.com", key="a1b2c3d4", urls=("https://example.com/",),
    )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        with pytest.raises(IndexNowTransportError) as error:
            await IndexNowClient(http_client).submit(request)

    assert "private-input" not in str(error.value)
    assert error.value.__suppress_context__
    handler.assert_called_once()


# 작업 취소를 실패 결과로 바꾸지 않고 호출자에게 전달합니다.
async def test_cancellation_propagates() -> None:
    handler = Mock(side_effect=asyncio.CancelledError)
    request = IndexNowRequest(
        host="example.com", key="a1b2c3d4", urls=("https://example.com/",),
    )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        with pytest.raises(asyncio.CancelledError):
            await IndexNowClient(http_client).submit(request)

    handler.assert_called_once()
