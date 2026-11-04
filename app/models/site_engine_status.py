"""메인 사이트와 글 URL의 검색엔진별 처리 상태입니다."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPrimaryKey


class SiteEngineStatus(UUIDPrimaryKey, Base):
    __tablename__ = "site_engine_statuses"
    __table_args__ = (
        UniqueConstraint("site_id", "engine", name="uq_site_engine_statuses_site_engine"),
        CheckConstraint(
            "engine IN ('google', 'naver', 'bing', 'brave')",
            name="ck_site_engine_statuses_engine",
        ),
        CheckConstraint(
            "index_status IN ('unknown', 'submitted', 'crawled', 'indexed', 'not_indexed', 'failed')",
            name="ck_site_engine_statuses_status",
        ),
        Index(
            "ix_site_engine_statuses_next_check_at", "next_check_at",
            postgresql_where=text("next_check_at IS NOT NULL"),
        ),
    )

    site_id: Mapped[UUID] = mapped_column(ForeignKey("sites.id", ondelete="RESTRICT"))
    engine: Mapped[str] = mapped_column(Text)
    index_status: Mapped[str] = mapped_column(Text, server_default=text("'unknown'"))
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_check_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[str | None] = mapped_column(Text)
    error_code: Mapped[str | None] = mapped_column(Text)
