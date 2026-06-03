from datetime import datetime
from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class Plot(Base):
    __tablename__ = "plots"
    id:           Mapped[str]   = mapped_column(String(50), primary_key=True)
    name:         Mapped[str]   = mapped_column(String(100), nullable=False)
    area_acres:   Mapped[float] = mapped_column(Float, default=0)
    soil_type:    Mapped[str]   = mapped_column(String(50),  nullable=True)
    water_source: Mapped[str]   = mapped_column(String(100), nullable=True)
    notes:        Mapped[str]   = mapped_column(String(500), nullable=True)
    created_at:   Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    cycles: Mapped[list["CropCycle"]] = relationship("CropCycle", back_populates="plot")  # type: ignore


class Crop(Base):
    __tablename__ = "crops"
    id:             Mapped[str]   = mapped_column(String(50), primary_key=True)
    name:           Mapped[str]   = mapped_column(String(100), nullable=False)
    emoji:          Mapped[str]   = mapped_column(String(10),  nullable=True)
    map_color:      Mapped[str]   = mapped_column(String(100), nullable=True)
    map_outline:    Mapped[str]   = mapped_column(String(100), nullable=True)
    duration_days:  Mapped[int]   = mapped_column(Integer, nullable=True)
    price_per_qtl:  Mapped[float] = mapped_column(Float, nullable=True)
    yield_per_acre: Mapped[float] = mapped_column(Float, nullable=True)
    created_at:     Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    activity_templates: Mapped[list["CropActivityTemplate"]] = relationship("CropActivityTemplate", back_populates="crop", cascade="all, delete-orphan")
    cycles: Mapped[list["CropCycle"]] = relationship("CropCycle", back_populates="crop")  # type: ignore


class CropActivityTemplate(Base):
    __tablename__ = "crop_activity_templates"
    id:            Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    crop_id:       Mapped[str] = mapped_column(String(50), ForeignKey("crops.id", ondelete="CASCADE"), nullable=False)
    day_number:    Mapped[int] = mapped_column(Integer, nullable=False)
    activity_type: Mapped[str] = mapped_column(String(50),  nullable=False)
    label:         Mapped[str] = mapped_column(String(200), nullable=False)
    inputs:        Mapped[str] = mapped_column(String(500), nullable=True)  # comma-separated inventory item IDs

    crop: Mapped["Crop"] = relationship("Crop", back_populates="activity_templates")


class InventoryItem(Base):
    __tablename__ = "inventory_items"
    id:            Mapped[str]   = mapped_column(String(50), primary_key=True)
    name:          Mapped[str]   = mapped_column(String(200), nullable=False)
    category:      Mapped[str]   = mapped_column(String(50),  nullable=False)
    unit:          Mapped[str]   = mapped_column(String(50),  nullable=False)
    current_stock: Mapped[float] = mapped_column(Float, default=0)
    min_threshold: Mapped[float] = mapped_column(Float, default=0)
    cost_per_unit: Mapped[float] = mapped_column(Float, default=0)
    created_at:    Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Labourer(Base):
    __tablename__ = "labourers"
    id:           Mapped[str]   = mapped_column(String(50), primary_key=True)
    name:         Mapped[str]   = mapped_column(String(200), nullable=False)
    work_type:    Mapped[str]   = mapped_column(String(100), nullable=True)
    rate_per_day: Mapped[float] = mapped_column(Float, default=0)
    phone:        Mapped[str]   = mapped_column(String(20),  nullable=True)
    created_at:   Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class LabourCategory(Base):
    __tablename__ = "labour_categories"
    id:           Mapped[str]   = mapped_column(String(50), primary_key=True)
    name:         Mapped[str]   = mapped_column(String(200), nullable=False)
    default_rate: Mapped[float] = mapped_column(Float, default=0)
    created_at:   Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# avoid circular import — import here
from models.ops import CropCycle  # noqa: E402, F401
