"""이메일별 Google·Bing 인증정보의 비밀파일 참조를 관리합니다."""

from sqlalchemy import CheckConstraint, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AuthAccount(Base):
    __tablename__ = "auth_accounts"
    __table_args__ = (
        CheckConstraint(
            "length(btrim(email)) > 0 AND email = btrim(email)",
            name="ck_auth_accounts_email_not_blank",
        ),
    )

    email: Mapped[str] = mapped_column(Text, primary_key=True)
    google_secret_ref: Mapped[str | None] = mapped_column(Text)
    bing_secret_ref: Mapped[str | None] = mapped_column(Text)
