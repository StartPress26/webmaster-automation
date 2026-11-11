"""이메일 기반 인증 계정과 메인 사이트별 연결을 추가합니다.

Revision ID: 0004
Revises: 0003
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# 메인 사이트는 인증 미연결을 허용하고 개별 글에는 계정 설정을 금지합니다.
def upgrade() -> None:
    op.create_table(
        "auth_accounts",
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("google_secret_ref", sa.Text(), nullable=True),
        sa.Column("bing_secret_ref", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("email", name="pk_auth_accounts"),
        sa.CheckConstraint(
            "length(btrim(email)) > 0 AND email = btrim(email)",
            name="ck_auth_accounts_email_not_blank",
        ),
    )

    op.add_column("sites", sa.Column("google_account_email", sa.Text(), nullable=True))
    op.add_column("sites", sa.Column("bing_account_email", sa.Text(), nullable=True))
    op.add_column("sites", sa.Column("naver_account_email", sa.Text(), nullable=True))

    op.create_foreign_key(
        "fk_sites_google_account_email", "sites", "auth_accounts",
        ["google_account_email"], ["email"], onupdate="CASCADE", ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_sites_bing_account_email", "sites", "auth_accounts",
        ["bing_account_email"], ["email"], onupdate="CASCADE", ondelete="RESTRICT",
    )
    op.create_check_constraint(
        "ck_sites_accounts_on_main", # 제약 조건 이름
        "sites", # 대상 테이블
        "target_type = 'site' OR (google_account_email IS NULL "
        "AND bing_account_email IS NULL AND naver_account_email IS NULL)",
    )


# 사이트의 연결 제약과 컬럼을 먼저 제거한 뒤 인증 계정 테이블을 제거합니다.
def downgrade() -> None:
    op.drop_constraint("ck_sites_accounts_on_main", "sites", type_="check")
    op.drop_constraint("fk_sites_bing_account_email", "sites", type_="foreignkey")
    op.drop_constraint("fk_sites_google_account_email", "sites", type_="foreignkey")
    op.drop_column("sites", "naver_account_email")
    op.drop_column("sites", "bing_account_email")
    op.drop_column("sites", "google_account_email")
    op.drop_table("auth_accounts")
