import uuid
from datetime import date
from sqlalchemy import String, Float, Date, ForeignKey, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID

from database import Base


class Sale(Base):
    __tablename__ = "sales"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    harvest_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("harvests.id", ondelete="CASCADE"))
    sale_date: Mapped[date] = mapped_column(Date, nullable=False)
    buyer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    buyer_contact: Mapped[str | None] = mapped_column(String(100), nullable=True)
    quantity_sold: Mapped[float] = mapped_column(Float, nullable=False)
    rate_per_unit: Mapped[float] = mapped_column(Float, nullable=False)
    total_revenue: Mapped[float] = mapped_column(Float, nullable=False)
    payment_status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | partial | received
    payment_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
