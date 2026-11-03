"""글을 먼저 커밋한 뒤 부모 설정으로 IndexNow 알림을 실행합니다."""

from urllib.parse import unquote, urlsplit
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.engines.indexnow.client import IndexNowClient, IndexNowTimeoutError, IndexNowTransportError
from app.engines.indexnow.schemas import IndexNowRequest
from app.models.engine_registration import EngineRegistration
from app.models.site import Site
from app.schemas.page import PageCreate, PageCreateResult, PageNotification, PageRead
from app.services.publication import notify_published_urls


class PageParentNotFoundError(Exception):
    """글을 등록할 부모 메인 사이트가 없습니다."""


class PageParentInactiveError(Exception):
    """부모 사이트가 비활성 상태입니다."""


class PageUrlScopeError(Exception):
    """글 URL이 부모의 출처·경로 밖에 있습니다."""


class DuplicatePageError(Exception):
    """같은 고객사에 이미 해당 URL이 저장돼 있습니다."""


# 다른 호스트·포트·프로토콜·상위 경로의 글을 부모 사이트에 추가하지 못하게 합니다.
def _validate_page_scope(parent_url: str, page_url: str) -> None:
    parent, page = urlsplit(parent_url), urlsplit(page_url)
    default_ports = {"http": 80, "https": 443}
    parent_origin = (parent.scheme, parent.hostname, parent.port or default_ports.get(parent.scheme))
    page_origin = (page.scheme, page.hostname, page.port or default_ports.get(page.scheme))
    root = unquote(parent.path).rstrip("/") + "/"
    if (
        parent_origin != page_origin
        or not (unquote(page.path) or "/").startswith(root)
        or (page.path, page.query) == (parent.path, parent.query)
    ):
        raise PageUrlScopeError("글 URL은 부모 사이트의 출처·경로 안에 있는 개별 페이지여야 합니다.")


# 설정 문제는 글 저장을 막지 않고 알림 결과로 반환하며 키는 응답에 포함하지 않습니다.
async def _prepare_notification(
    session: AsyncSession, parent_id: UUID, page_url: str,
) -> IndexNowRequest | PageNotification:
    rows = tuple(await session.scalars(select(EngineRegistration).where(
        EngineRegistration.main_site_id == parent_id,
        EngineRegistration.engine.in_(("bing", "naver")),
    )))
    if not rows or all(row.indexnow_key is None and row.indexnow_key_location is None for row in rows):
        return PageNotification(status="skipped", error_code="INDEXNOW_NOT_CONFIGURED")
    if (
        len(rows) != 2
        or any(not row.indexnow_key or not row.indexnow_key_location for row in rows)
        or len({(row.indexnow_key, row.indexnow_key_location) for row in rows}) != 1
    ):
        return PageNotification(status="failed", error_code="INDEXNOW_SETTINGS_INCONSISTENT")
    try:
        # 부모 사이트의 키와 새 글 URL을 묶어서, IndexNow에 보낼 요청 객체를 만들기
        return IndexNowRequest(
            host=urlsplit(page_url).hostname or "", key=rows[0].indexnow_key,
            key_location=rows[0].indexnow_key_location, urls=(page_url,),
        )
    except ValidationError:
        return PageNotification(status="failed", error_code="INVALID_INDEXNOW_SETTINGS")


# 저장 트랜잭션을 먼저 완료하고 외부 알림은 한 번만 실행합니다.
async def create_page(
    session: AsyncSession, parent_id: UUID, data: PageCreate, *, client: IndexNowClient,
) -> PageCreateResult:
    async with session.begin():
        # 부모 사이트 들고 오기
        parent = await session.scalar(select(Site).where(
            Site.id == parent_id, Site.target_type == "site",
        ).with_for_update(read=True))
        if parent is None:
            raise PageParentNotFoundError("부모 메인 사이트를 찾을 수 없습니다.")
        if not parent.is_active:
            raise PageParentInactiveError("비활성 사이트에는 글을 추가할 수 없습니다.")
        _validate_page_scope(parent.url, data.url)

        # IndexNow에 보낼 요청
        notification = await _prepare_notification(session, parent.id, data.url) if data.notify_search_engines else (
            PageNotification(status="skipped", error_code="NOTIFICATION_DISABLED")
        )

        # site 저장
        page = await session.scalar(insert(Site).values(
            client_id=parent.client_id, parent_site_id=parent.id, target_type="page",
            owner_type=parent.owner_type, name=data.name, url=data.url,
        ).on_conflict_do_nothing(constraint="uq_sites_client_url").returning(Site))

        if page is None:
            raise DuplicatePageError("이 고객사에 이미 등록된 URL입니다.")
        saved = PageRead.model_validate(page)

    if isinstance(notification, PageNotification):
        return PageCreateResult(page=saved, submission=notification)
    try:
        result = await notify_published_urls(notification, client=client)
        return PageCreateResult(page=saved, submission=PageNotification(
            status=result.status, upstream_http_status=result.http_status,
            requested_at=result.requested_at,
            error_code="INDEXNOW_REJECTED" if result.status == "failed" else None,
        ))
    except (IndexNowTimeoutError, IndexNowTransportError) as error:
        return PageCreateResult(page=saved, submission=PageNotification(
            status="unknown", error_code="INDEXNOW_TIMEOUT" if isinstance(error, IndexNowTimeoutError)
            else "INDEXNOW_TRANSPORT_ERROR",
        ))
