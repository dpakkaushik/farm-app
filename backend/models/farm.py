import uuid
from datetime import datetime
from sqlalchemy import String, Float, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB

from database import Base


class Farm(Base):
    __tablename__ = "farms"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    location: Mapped[str] = mapped_column(String(500), nullable=False)
    total_acres: Mapped[float] = mapped_column(Float, nullable=False)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    geo_bounds: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Saved map state: {zoom, center: [lng, lat], bearing, pitch}
    map_state: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Plot layout overlay image settings
    overlay_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
