"""발행 알림이 공통 IndexNow 경로로 한 번만 전송되는지 검증합니다."""

import json
from unittest.mock import Mock

import httpx
import pytest

from app.engines.indexnow.client import (
    IndexNowClient,
    IndexNowTimeoutError,
    IndexNowTransportError,
)
from app.engines.indexnow.schemas import IndexNowRequest, SubmissionStatus
from app.services.publication import notify_published_urls

pytestmark = pytest.mark.anyio


# 프로젝트에서 사용하는 asyncio 백엔드로 실행합니다.
@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


# 중복 URL을 포함해도 엔진별 재전송 없이 공통 엔드포인트로 한 번만 제출합니다.
@pytest.mark.parametrize(
    "http_status, expected",
    [(200, "accepted"), (202, "key_pending"), (429, "failed"), (500, "failed")],
)
async def test_publication_submits_once(
    http_status: int, expected: SubmissionStatus,
) -> None:
    request = IndexNowRequest(
        host="example.com", key="a1b2c3d4",
        urls=("https://example.com/new-post", "https://example.com/new-post"),
        key_location="https://example.com/key.txt",
    )
    handler = Mock(return_value=httpx.Response(http_status))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        result = await notify_published_urls(request, client=IndexNowClient(http_client))
        assert not http_client.is_closed

    handler.assert_called_once()
    sent = handler.call_args.args[0]
    assert sent.method == "POST"
    assert str(sent.url) == "https://api.indexnow.org/indexnow"
    assert json.loads(sent.content) == {
        "host": request.host, "key": request.key,
        "urlList": ["https://example.com/new-post"],
        "keyLocation": request.key_location,
    }
    assert result.http_status == http_status
    assert result.status == expected


# 접수 여부를 모르는 통신 오류는 자동 재시도하거나 성공·실패 결과로 바꾸지 않습니다.
@pytest.mark.parametrize(
    "error_type, expected_error",
    [(httpx.ReadTimeout, IndexNowTimeoutError), (httpx.ConnectError, IndexNowTransportError)],
)
async def test_publication_propagates_transport_error_without_retry(
    error_type: type[httpx.RequestError], expected_error: type[Exception],
) -> None:
    request = IndexNowRequest(
        host="example.com", key="a1b2c3d4", urls=("https://example.com/new-post",),
    )
    handler = Mock(side_effect=error_type("테스트 통신 오류"))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        with pytest.raises(expected_error):
            await notify_published_urls(request, client=IndexNowClient(http_client))
    handler.assert_called_once()
