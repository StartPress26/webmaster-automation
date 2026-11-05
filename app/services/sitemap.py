"""메인 사이트와 제출 범위를 검증하며 제출 이력은 저장하지 않습니다."""

from urllib.parse import unquote, urlsplit
from uuid import UUID

from pydantic import TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engines.bing import BingEngineError
from app.engines.google.google import GoogleEngineError
from app.engines.indexnow.schemas import IndexNowUrl
from app.engines.sitemap import SitemapSubmitter
from app.models.site import Site
from app.schemas.sitemap import SitemapCreate, SitemapRead


class SitemapError(Exception):
    # 공개 가능한 고정 메시지와 HTTP 상태만 보관합니다.
    def __init__(self, code: str, message: str, http_status: int) -> None:
        super().__init__(message)
        self.code = code
        self.http_status = http_status


# 같은 출처와 하위 경로로 제한해 다른 사이트에 제출하지 않도록 합니다.
def validate_scope(site_url: str, data: SitemapCreate) -> None:
    try:
        TypeAdapter(IndexNowUrl).validate_python(site_url)
        main, sitemap = urlsplit(site_url), urlsplit(data.sitemap_url)
        ports = {"http": 80, "https": 443}
        same_origin = (main.scheme, main.hostname, main.port or ports[main.scheme]) == (
            sitemap.scheme, sitemap.hostname, sitemap.port or ports[sitemap.scheme],
        )
        if not same_origin or not (unquote(sitemap.path) or "/").startswith(
            unquote(main.path).rstrip("/") + "/"
        ) or main.query:
            raise ValueError
        if data.engine == "google" and not main.path.endswith("/"):
            raise ValueError
        if data.engine == "bing" and main.path not in ("", "/"):
            raise ValueError
    except (ValidationError, ValueError):
        raise SitemapError(
            "INVALID_SITEMAP_SCOPE", "사이트맵은 검색엔진이 지원하는 메인 사이트의 URL 범위 안에 있어야 합니다.", 422,
        ) from None


# DB 조회를 마친 뒤 외부에 제출하고 접수 결과만 반환합니다.
async def submit_sitemap(
    session: AsyncSession, main_site_id: UUID, data: SitemapCreate, *, submitter: SitemapSubmitter,
) -> SitemapRead:
    async with session.begin():
        site = await session.scalar(select(Site).where(
            Site.id == main_site_id, Site.target_type == "site",
        ))
        if site is None:
            raise SitemapError("MAIN_SITE_NOT_FOUND", "메인 사이트를 찾을 수 없습니다.", 404)
        if not site.is_active:
            raise SitemapError("SITE_INACTIVE", "비활성 사이트에는 제출할 수 없습니다.", 409)
        site_url = site.url
        validate_scope(site_url, data)
    try:
        accepted = await submitter(data.engine, site_url, data.sitemap_url)
    except (GoogleEngineError, BingEngineError) as error:
        messages = {
            "authentication": (503, "검색엔진 인증 설정을 확인하세요."),
            "permission": (502, "검색엔진 사이트 접근 권한이 없습니다."),
            "rate_limit": (429, "검색엔진 제출 한도를 초과했습니다."),
            "timeout": (504, "사이트맵 제출 시간이 초과됐습니다. 접수 여부는 확인되지 않았습니다."),
            "connection": (502, "검색엔진 연결 오류로 접수 여부를 확인하지 못했습니다."),
            "response": (502, "검색엔진 제출 응답을 확인하지 못했습니다."),
        }
        status, message = messages[error.code]
        raise SitemapError(f"ENGINE_{error.code.upper()}", message, status) from None
    except ValueError:
        raise SitemapError("INVALID_SITEMAP_SCOPE", "엔진이 지원하는 URL 범위를 확인하세요.", 422) from None
    if accepted is not True:
        raise SitemapError("ENGINE_RESPONSE", "검색엔진 제출 접수를 확인하지 못했습니다.", 502)
    return SitemapRead(main_site_id=main_site_id, engine=data.engine, sitemap_url=data.sitemap_url)
