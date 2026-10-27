"""메인 사이트의 검색엔진 등록과 소유권 확인 상태입니다."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPrimaryKey


class EngineRegistration(UUIDPrimaryKey, Base):
    __tablename__ = "engine_registrations"
    __table_args__ = (
        UniqueConstraint("main_site_id", "engine", name="uq_engine_registrations_site_engine"),
        CheckConstraint(
            "engine IN ('google', 'naver', 'bing', 'brave')",
            name="ck_engine_registrations_engine",
        ),
        CheckConstraint(
            "registration_status IN ('unknown', 'submitted', 'verified', 'failed')",
            name="ck_engine_registrations_status",
        ),
    )

    main_site_id: Mapped[UUID] = mapped_column(ForeignKey("sites.id", ondelete="RESTRICT"))
    engine: Mapped[str] = mapped_column(Text)
    registration_status: Mapped[str | None] = mapped_column(
        Text().evaluates_none(), server_default=text("'unknown'")
    )
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[str | None] = mapped_column(Text)
    # Naver·Bing은 같은 IndexNow 설정을 저장하며, 다른 엔진은 NULL을 사용합니다.
    indexnow_key: Mapped[str | None] = mapped_column(Text)
    indexnow_key_location: Mapped[str | None] = mapped_column(Text)
