"""고객사·URL·검색엔진 등록 및 색인 상태 테이블 생성.

Revision ID: 0001
Revises: 없음
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "clients",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("manager_name", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("length(btrim(name)) > 0", name="ck_clients_name_not_blank"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_clients")),
    )
    op.create_table(
        "sites",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("client_id", sa.Uuid(), nullable=False),
        sa.Column("parent_site_id", sa.Uuid(), nullable=True),
        sa.Column("target_type", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("owner_type", sa.Text(), nullable=False),
        sa.Column("cms_type", sa.Text(), nullable=True),
        sa.Column("can_edit_site", sa.Boolean(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sites")),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], name=op.f("fk_sites_client_id_clients"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["parent_site_id"], ["sites.id"], name=op.f("fk_sites_parent_site_id_sites"), ondelete="RESTRICT"),
        sa.UniqueConstraint("client_id", "url", name="uq_sites_client_url"),
        sa.CheckConstraint("target_type IN ('site', 'page')", name="ck_sites_target_type"),
        sa.CheckConstraint("owner_type IN ('internal', 'client')", name="ck_sites_owner_type"),
        sa.CheckConstraint("length(btrim(name)) > 0", name="ck_sites_name_not_blank"),
        sa.CheckConstraint("url ~ '^https?://' AND octet_length(url) <= 2048", name="ck_sites_url_format"),
        sa.CheckConstraint(
            "(target_type = 'site' AND parent_site_id IS NULL) OR "
            "(target_type = 'page' AND parent_site_id IS NOT NULL)",
            name="ck_sites_parent_scope",
        ),
        sa.CheckConstraint("parent_site_id <> id", name="ck_sites_not_own_parent"),
        sa.CheckConstraint(
            "target_type = 'site' OR (cms_type IS NULL AND can_edit_site IS NULL)",
            name="ck_sites_shared_settings_on_main",
        ),
    )
    op.create_index(op.f("ix_sites_client_id"), "sites", ["client_id"])
    op.create_index(op.f("ix_sites_parent_site_id"), "sites", ["parent_site_id"])
    op.create_table(
        "engine_registrations",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("main_site_id", sa.Uuid(), nullable=False),
        sa.Column("engine", sa.Text(), nullable=False),
        sa.Column("registration_status", sa.Text(), server_default=sa.text("'unknown'"), nullable=True),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_engine_registrations")),
        sa.ForeignKeyConstraint(["main_site_id"], ["sites.id"], name=op.f("fk_engine_registrations_main_site_id_sites"), ondelete="RESTRICT"),
        sa.UniqueConstraint("main_site_id", "engine", name="uq_engine_registrations_site_engine"),
        sa.CheckConstraint("engine IN ('google', 'naver', 'bing', 'brave')", name="ck_engine_registrations_engine"),
        sa.CheckConstraint("registration_status IN ('unknown', 'submitted', 'verified', 'failed')", name="ck_engine_registrations_status"),
    )
    op.create_table(
        "site_engine_statuses",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("site_id", sa.Uuid(), nullable=False),
        sa.Column("engine", sa.Text(), nullable=False),
        sa.Column("index_status", sa.Text(), server_default=sa.text("'unknown'"), nullable=False),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_check_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_site_engine_statuses")),
        sa.ForeignKeyConstraint(["site_id"], ["sites.id"], name=op.f("fk_site_engine_statuses_site_id_sites"), ondelete="RESTRICT"),
        sa.UniqueConstraint("site_id", "engine", name="uq_site_engine_statuses_site_engine"),
        sa.CheckConstraint("engine IN ('google', 'naver', 'bing', 'brave')", name="ck_site_engine_statuses_engine"),
        sa.CheckConstraint(
            "index_status IN ('unknown', 'submitted', 'crawled', 'indexed', 'not_indexed', 'failed')",
            name="ck_site_engine_statuses_status",
        ),
    )
    op.create_index(
        "ix_site_engine_statuses_next_check_at", "site_engine_statuses", ["next_check_at"],
        postgresql_where=sa.text("next_check_at IS NOT NULL"),
    )

    # 유형을 생성 후 고정하면 동시 요청에서도 부모의 역할이 바뀌지 않습니다.
    op.execute("""
        CREATE FUNCTION public.validate_site_parent() RETURNS trigger
        LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
        DECLARE parent_type text;
        BEGIN
            IF TG_OP = 'UPDATE' THEN
                IF NEW.target_type IS DISTINCT FROM OLD.target_type THEN
                    RAISE EXCEPTION '메인 사이트와 글의 유형은 생성 후 변경할 수 없습니다.'
                        USING ERRCODE = '23514';
                END IF;
            END IF;
            IF NEW.target_type = 'page' THEN
                SELECT target_type INTO parent_type
                FROM public.sites WHERE id = NEW.parent_site_id;
                IF parent_type IS DISTINCT FROM 'site' THEN
                    RAISE EXCEPTION '글의 부모는 존재하는 메인 사이트여야 합니다.'
                        USING ERRCODE = '23514';
                END IF;
            END IF;
            RETURN NEW;
        END;
        $$
    """)
    op.execute("""
        CREATE TRIGGER sites_validate_parent
        BEFORE INSERT OR UPDATE OF target_type, parent_site_id ON public.sites
        FOR EACH ROW EXECUTE FUNCTION public.validate_site_parent()
    """)
    op.execute("""
        CREATE FUNCTION public.validate_registration_main_site() RETURNS trigger
        LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM public.sites
                WHERE id = NEW.main_site_id AND target_type = 'site'
            ) THEN
                RAISE EXCEPTION '검색엔진 등록 정보는 메인 사이트에만 연결할 수 있습니다.'
                    USING ERRCODE = '23514';
            END IF;
            RETURN NEW;
        END;
        $$
    """)
    op.execute("""
        CREATE TRIGGER engine_registrations_validate_main_site
        BEFORE INSERT OR UPDATE OF main_site_id ON public.engine_registrations
        FOR EACH ROW EXECUTE FUNCTION public.validate_registration_main_site()
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER engine_registrations_validate_main_site ON public.engine_registrations")
    op.execute("DROP FUNCTION public.validate_registration_main_site()")
    op.execute("DROP TRIGGER sites_validate_parent ON public.sites")
    op.execute("DROP FUNCTION public.validate_site_parent()")
    op.drop_table("site_engine_statuses")
    op.drop_table("engine_registrations")
    op.drop_table("sites")
    op.drop_table("clients")
