import uuid
from datetime import date, datetime
from sqlalchemy import String, Float, Integer, Date, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB

from database import Base


class CropTemplate(Base):
    __tablename__ = "crop_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    farm_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("farms.id", ondelete="CASCADE"))
    crop_name: Mapped[str] = mapped_column(String(100), nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False)
    activity_schedule: Mapped[list] = mapped_column(JSONB, default=list)
    expected_yield_per_acre: Mapped[float | None] = mapped_column(Float, nullable=True)


class CropCycle(Base):
    __tablename__ = "crop_cycles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plot_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("plots.id", ondelete="CASCADE"))
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("crop_templates.id"))
    sow_date: Mapped[date] = mapped_column(Date, nullable=False)
    expected_harvest_date: Mapped[date] = mapped_column(Date, nullable=False)
    actual_harvest_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="active")  # active | harvested | failed
    season: Mapped[str | None] = mapped_column(String(50), nullable=True)
    budget: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
