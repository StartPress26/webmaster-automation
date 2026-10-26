"""메인 사이트와 개별 글을 같은 테이블에서 관리합니다."""

from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAt, UUIDPrimaryKey


class Site(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "sites"
    __table_args__ = (
        UniqueConstraint("client_id", "url", name="uq_sites_client_url"),
        CheckConstraint("target_type IN ('site', 'page')", name="ck_sites_target_type"),
        CheckConstraint("owner_type IN ('internal', 'client')", name="ck_sites_owner_type"),
        CheckConstraint("length(btrim(name)) > 0", name="ck_sites_name_not_blank"),
        CheckConstraint(
            "url ~ '^https?://' AND octet_length(url) <= 2048",
            name="ck_sites_url_format",
        ),
        CheckConstraint(
            "(target_type = 'site' AND parent_site_id IS NULL) OR "
            "(target_type = 'page' AND parent_site_id IS NOT NULL)",
            name="ck_sites_parent_scope",
        ),
        CheckConstraint("parent_site_id <> id", name="ck_sites_not_own_parent"),
        CheckConstraint(
            "target_type = 'site' OR (cms_type IS NULL AND can_edit_site IS NULL)",
            name="ck_sites_shared_settings_on_main",
        ),
    )

    client_id: Mapped[UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="RESTRICT"), index=True
    )
    parent_site_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("sites.id", ondelete="RESTRICT"), index=True
    )
    target_type: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    url: Mapped[str] = mapped_column(Text)
    owner_type: Mapped[str] = mapped_column(Text)
    cms_type: Mapped[str | None] = mapped_column(Text)
    can_edit_site: Mapped[bool | None] = mapped_column(Boolean)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
