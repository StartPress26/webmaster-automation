"""새 글의 발행 사실을 공통 IndexNow 경로로 알립니다."""

from app.engines.indexnow.client import IndexNowClient
from app.engines.indexnow.schemas import IndexNowRequest, IndexNowResult


# 검증된 새 글 URL을 한 번 제출하고 공통 접수 결과나 통신 예외를 전달합니다.
async def notify_published_urls(
    request: IndexNowRequest, *, client: IndexNowClient,
) -> IndexNowResult:
    """Naver·Bing별로 중복 호출하지 않으며, 접수 결과는 수집·색인 완료가 아닙니다.

    클라이언트 생성·종료는 호출자가 담당합니다. DB 저장과 자동 재시도는 수행하지 않습니다.
    """

    return await client.submit(request)
