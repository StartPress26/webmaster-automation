"""고객사 정보입니다."""

from sqlalchemy import CheckConstraint, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAt, UUIDPrimaryKey


class Client(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "clients"
    __table_args__ = (
        CheckConstraint("length(btrim(name)) > 0", name="ck_clients_name_not_blank"),
    )

    name: Mapped[str] = mapped_column(Text)
    manager_name: Mapped[str | None] = mapped_column(Text)
