"""기존 관측을 유지하며 최신 오류 코드를 추가합니다.

Revision ID: 0003
Revises: 0002
"""

from collections.abc import Sequence
from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# 기존 관측과 오류 메시지를 유지하면서 선택적인 원인 코드만 추가합니다.
def upgrade() -> None:
    op.add_column("site_engine_statuses", sa.Column("error_code", sa.Text(), nullable=True))


# 이전 구조로 되돌릴 때 세부 오류 코드 컬럼만 제거합니다.
def downgrade() -> None:
    op.drop_column("site_engine_statuses", "error_code")
