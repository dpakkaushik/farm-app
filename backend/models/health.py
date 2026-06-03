import uuid
from datetime import date
from sqlalchemy import String, Date, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, ARRAY

from database import Base


class CropHealthLog(Base):
    __tablename__ = "crop_health_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    crop_cycle_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("crop_cycles.id", ondelete="CASCADE"))
    log_date: Mapped[date] = mapped_column(Date, nullable=False)
    health_rating: Mapped[str] = mapped_column(String(20), nullable=False)  # good | average | concern
    issue_tags: Mapped[list] = mapped_column(ARRAY(String), default=list)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    logged_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
