"""공통 IndexNow 엔드포인트에 URL 변경을 비동기로 알립니다."""

from dataclasses import dataclass, field
from datetime import datetime, timezone

import httpx

from app.engines.indexnow.schemas import IndexNowRequest, IndexNowResult

INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow"


class IndexNowError(Exception):
    """HTTP 접수 결과를 얻지 못한 IndexNow 통신 오류입니다."""


class IndexNowTimeoutError(IndexNowError):
    """시간 초과로 접수 결과를 확인하지 못했습니다."""


class IndexNowTransportError(IndexNowError):
    """연결·프로토콜 등의 문제로 접수 결과를 확인하지 못했습니다."""


@dataclass(frozen=True)
class IndexNowClient:
    """전용 AsyncClient를 주입받으며 연결 생성·종료는 호출자가 담당합니다.

    공유 연결에 다른 서비스의 인증정보나 재시도 설정을 넣지 않습니다.
    DB 저장·예약·재시도는 이 클라이언트를 호출하는 서비스가 담당합니다.
    """

    http_client: httpx.AsyncClient = field(repr=False)

    # 검증된 요청을 한 번 제출하고, HTTP 응답 또는 통신 오류를 반환합니다.
    async def submit(self, request: IndexNowRequest) -> IndexNowResult:
        payload = {
            "host": request.host,
            "key": request.key,
            "urlList": request.urls,
        } | ({"keyLocation": request.key_location} if request.key_location is not None else {})
        requested_at = datetime.now(timezone.utc)

        try:
            response = await self.http_client.post(
                INDEXNOW_ENDPOINT,
                json=payload,
                headers={"Content-Type": "application/json; charset=utf-8"},
                timeout=httpx.Timeout(30.0, connect=10.0),
                # 키가 포함된 요청이 리다이렉트 대상에 재전송되지 않도록 합니다.
                follow_redirects=False,
            )
        except httpx.TimeoutException:
            raise IndexNowTimeoutError(
                "IndexNow 요청 시간이 초과되어 접수 결과를 확인하지 못했습니다."
            ) from None
        except httpx.RequestError:
            # 원본 예외에 포함될 수 있는 URL·키·응답 본문을 외부로 전달하지 않습니다.
            raise IndexNowTransportError(
                "IndexNow 통신 오류로 접수 결과를 확인하지 못했습니다."
            ) from None

        # 오류 응답도 상태 코드로 반환하며, 본문을 JSON으로 가정하지 않습니다.
        return IndexNowResult(
            http_status=response.status_code,
            requested_at=requested_at,
        )
