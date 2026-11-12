"""사이트·글을 검사하고 기존 상태 테이블의 엔진별 최신 관측을 관리합니다."""

from datetime import datetime, timezone
from urllib.parse import unquote, urlsplit
from uuid import UUID

from pydantic import TypeAdapter, ValidationError
from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.engines.bing import BingEngineError
from app.engines.google.google import GoogleEngineError
from app.engines.indexnow.schemas import IndexNowUrl
from app.engines.inspection import Inspector, GoogleInspectionAuthError
from app.models.site import Site
from app.models.site_engine_status import SiteEngineStatus
from app.schemas.inspection import InspectionEngine, InspectionRead
from app.services.auth_account import (
    AuthAccountNotFoundError, SecretReferenceNotFoundError, get_secret_reference,
)


class InspectionTargetNotFoundError(Exception):
    """검사할 사이트·글 또는 부모가 없습니다."""


class InspectionInactiveError(Exception):
    """검사 대상 또는 부모가 비활성입니다."""


class InspectionScopeError(Exception):
    """대상 URL이 부모 또는 엔진의 지원 범위에 속하지 않습니다."""


class InspectionUpstreamError(Exception):
    # 원본 인증정보·응답 대신 공개할 코드·메시지·HTTP 상태만 보관합니다.
    def __init__(self, code: str, message: str, http_status: int) -> None:
        super().__init__(message)
        self.code = code
        self.http_status = http_status


# 저장된 URL과 부모 관계를 검사하며 외부 호출 전에 조회 트랜잭션을 닫습니다.
async def _get_context(
    session: AsyncSession, site_id: UUID, engine: InspectionEngine,
) -> tuple[str, str, str]:
    async with session.begin():
        target = await session.scalar(select(Site).where(Site.id == site_id).with_for_update(read=True))
        if target is None:
            raise InspectionTargetNotFoundError("검사할 사이트·글을 찾을 수 없습니다.")

        parent = target if target.target_type == "site" else await session.scalar(select(Site).where(
            Site.id == target.parent_site_id, Site.target_type == "site",
        ).with_for_update(read=True))
        if parent is None:
            raise InspectionTargetNotFoundError("부모 메인 사이트를 찾을 수 없습니다.")
        if not target.is_active or not parent.is_active:
            raise InspectionInactiveError("비활성 사이트·글은 검사할 수 없습니다.")

        try:
            validator = TypeAdapter(IndexNowUrl)

            validator.validate_python(parent.url)
            validator.validate_python(target.url)

            main, page = urlsplit(parent.url), urlsplit(target.url)
            ports = {"http": 80, "https": 443}
            if (
                target.client_id != parent.client_id or target.owner_type != parent.owner_type
                or (main.scheme, main.hostname, main.port or ports[main.scheme])
                != (page.scheme, page.hostname, page.port or ports[page.scheme])
                or (target.id != parent.id and not (unquote(page.path) or "/").startswith(
                    unquote(main.path).rstrip("/") + "/"
                ))
            ):
                raise InspectionScopeError("대상은 부모 사이트의 고객사·소유 구분·URL 범위 안에 있어야 합니다.")
            if engine == "google" and (not main.path.endswith("/") or main.query):
                raise InspectionScopeError("Google 속성 URL은 쿼리 없이 /로 끝나야 합니다.")
            if engine == "bing" and (main.path not in ("", "/") or main.query):
                raise InspectionScopeError("Bing 검사는 쿼리·하위 경로 없는 루트 사이트를 지원합니다.")
        except (ValidationError, ValueError):
            raise InspectionScopeError("검사할 URL 형식이 올바르지 않습니다.") from None

        email = parent.google_account_email if engine == "google" else parent.bing_account_email
        if not email:
            raise InspectionUpstreamError(
                "AUTH_ACCOUNT_NOT_LINKED", "메인 사이트에 해당 검색엔진의 인증 계정을 연결하세요.", 503,
            )

        try:
            reference = await get_secret_reference(session, email=email, engine=engine)
        except AuthAccountNotFoundError:
            raise InspectionUpstreamError(
                "AUTH_ACCOUNT_NOT_FOUND", "연결된 검색엔진 인증 계정을 찾을 수 없습니다.", 503,
            ) from None
        except SecretReferenceNotFoundError:
            raise InspectionUpstreamError(
                "SECRET_REFERENCE_NOT_FOUND", "인증 계정에 해당 검색엔진의 비밀파일 참조를 등록하세요.", 503,
            ) from None

        return parent.url, target.url, reference


# 외부 오류는 고정 메시지로 변환해 원본 키·토큰·본문이 저장되지 않게 합니다.
def _public_error(error: GoogleEngineError | BingEngineError) -> InspectionUpstreamError:
    if isinstance(error, GoogleInspectionAuthError):
        return InspectionUpstreamError(f"GOOGLE_AUTH_{error.auth_code.upper()}", str(error), 503)

    messages = {
        "authentication": (503, "검색엔진 인증 설정을 확인하세요."),
        "permission": (502, "검색엔진 사이트 접근 권한이 없습니다."),
        "rate_limit": (429, "검색엔진 조회 한도를 초과했습니다."),
        "timeout": (504, "검색엔진 상태 조회 시간이 초과됐습니다."),
        "connection": (502, "검색엔진에 연결하지 못했습니다."),
        "response": (502, "검색엔진 응답을 확인하지 못했습니다."),
    }
    status, message = messages[error.code]

    return InspectionUpstreamError(f"ENGINE_{error.code.upper()}", message, status)


# 최신 성공 관측만 덮어쓰고 실패 시에는 기존 판정·확인 시각을 보존합니다.
async def run_inspection(
    session: AsyncSession, site_id: UUID, engine: InspectionEngine, *, inspector: Inspector,
) -> InspectionRead:
    main_url, page_url, reference = await _get_context(session, site_id, engine)

    started_at = datetime.now(timezone.utc)

    try:
        result = await inspector(engine, main_url, page_url, reference)
    except (GoogleEngineError, BingEngineError) as error:
        public_error = _public_error(error)

        async with session.begin():
            statement = insert(SiteEngineStatus).values(
                site_id=site_id, engine=engine, index_status="unknown", error_message=str(public_error), error_code=public_error.code,
            )

            await session.execute(statement.on_conflict_do_update(
                constraint="uq_site_engine_statuses_site_engine",
                set_={"error_message": str(public_error), "error_code": public_error.code},
                where=or_(SiteEngineStatus.last_checked_at.is_(None), SiteEngineStatus.last_checked_at <= started_at),
            ))

        raise public_error from None
    except ValueError:
        raise InspectionScopeError("대상 URL이 검색엔진의 지원 범위에 속하지 않습니다.") from None

    async with session.begin():
        statement = insert(SiteEngineStatus).values(
            site_id=site_id, engine=engine, index_status=result.index_status,
            last_checked_at=result.checked_at, error_message=None, error_code=None,
        )

        await session.execute(statement.on_conflict_do_update(
            constraint="uq_site_engine_statuses_site_engine",
            set_={
                "index_status": statement.excluded.index_status,
                "last_checked_at": statement.excluded.last_checked_at,
                "error_message": None,
                "error_code": None,
            },
            where=or_(SiteEngineStatus.last_checked_at.is_(None), SiteEngineStatus.last_checked_at <= result.checked_at),
        ))
        stored = await session.scalar(select(SiteEngineStatus).where(
            SiteEngineStatus.site_id == site_id, SiteEngineStatus.engine == engine,
        ))

        return InspectionRead.model_validate(stored)


# 존재하는 대상의 저장 상태만 읽으며 인증 로드·외부 조회는 실행하지 않습니다.
async def list_inspections(session: AsyncSession, site_id: UUID) -> tuple[InspectionRead, ...]:
    async with session.begin():
        if await session.scalar(select(Site.id).where(Site.id == site_id)) is None:
            raise InspectionTargetNotFoundError("사이트·글을 찾을 수 없습니다.")

        rows = await session.scalars(select(SiteEngineStatus).where(
            SiteEngineStatus.site_id == site_id,
        ).order_by(SiteEngineStatus.engine))

        return tuple(InspectionRead.model_validate(row) for row in rows)
