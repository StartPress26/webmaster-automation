"""검색엔진 등록 정보에 IndexNow 키와 공개 파일 주소를 추가합니다.

Revision ID: 0002
Revises: 0001
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# 기존 행을 유지하면서 선택적인 IndexNow 설정 컬럼을 추가합니다.
def upgrade() -> None:
    op.add_column("engine_registrations", sa.Column("indexnow_key", sa.Text(), nullable=True))
    op.add_column(
        "engine_registrations",
        sa.Column("indexnow_key_location", sa.Text(), nullable=True),
    )


# 이전 구조로 되돌릴 때 IndexNow 설정 컬럼만 제거합니다.
def downgrade() -> None:
    op.drop_column("engine_registrations", "indexnow_key_location")
    op.drop_column("engine_registrations", "indexnow_key")
