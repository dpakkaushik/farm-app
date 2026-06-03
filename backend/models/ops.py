from datetime import date, datetime
from sqlalchemy import String, Float, Integer, Date, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class CropCycle(Base):
    __tablename__ = "crop_cycles"
    id:                    Mapped[str]   = mapped_column(String(50), primary_key=True)
    plot_id:               Mapped[str]   = mapped_column(String(50), ForeignKey("plots.id"), nullable=False)
    crop_id:               Mapped[str]   = mapped_column(String(50), ForeignKey("crops.id"), nullable=False)
    sow_date:              Mapped[date]  = mapped_column(Date, nullable=False)
    expected_harvest_date: Mapped[date]  = mapped_column(Date, nullable=True)
    actual_harvest_date:   Mapped[date]  = mapped_column(Date, nullable=True)
    status:                Mapped[str]   = mapped_column(String(20), default="active")
    acres:                 Mapped[float] = mapped_column(Float, default=0)
    harvest_qtl:           Mapped[float] = mapped_column(Float, nullable=True)
    revenue:               Mapped[float] = mapped_column(Float, nullable=True)
    quality:               Mapped[str]   = mapped_column(String(10),  nullable=True)
    buyer:                 Mapped[str]   = mapped_column(String(200), nullable=True)
    created_at:            Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    plot: Mapped["Plot"] = relationship("Plot", back_populates="cycles")  # type: ignore
    crop: Mapped["Crop"] = relationship("Crop", back_populates="cycles")  # type: ignore
    issues:     Mapped[list["InventoryIssue"]] = relationship("InventoryIssue", back_populates="cycle")
    activities: Mapped[list["ActivityLog"]]    = relationship("ActivityLog",    back_populates="cycle")


class InventoryPurchase(Base):
    __tablename__ = "inventory_purchases"
    id:            Mapped[str]   = mapped_column(String(50), primary_key=True)
    item_id:       Mapped[str]   = mapped_column(String(50), ForeignKey("inventory_items.id"), nullable=False)
    purchase_date: Mapped[date]  = mapped_column(Date, nullable=False)
    qty:           Mapped[float] = mapped_column(Float, nullable=False)
    unit_price:    Mapped[float] = mapped_column(Float, nullable=False)
    total_cost:    Mapped[float] = mapped_column(Float, nullable=False)
    vendor:        Mapped[str]   = mapped_column(String(200), nullable=True)
    invoice_no:    Mapped[str]   = mapped_column(String(100), nullable=True)
    notes:         Mapped[str]   = mapped_column(String(500), nullable=True)
    created_at:    Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class InventoryIssue(Base):
    __tablename__ = "inventory_issues"
    id:            Mapped[str]   = mapped_column(String(50), primary_key=True)
    item_id:       Mapped[str]   = mapped_column(String(50), ForeignKey("inventory_items.id"), nullable=False)
    cycle_id:      Mapped[str]   = mapped_column(String(50), ForeignKey("crop_cycles.id"), nullable=True)
    plot_id:       Mapped[str]   = mapped_column(String(50), nullable=True)
    plot_label:    Mapped[str]   = mapped_column(String(100), nullable=True)
    issue_date:    Mapped[date]  = mapped_column(Date, nullable=False)
    qty:           Mapped[float] = mapped_column(Float, nullable=False)
    total_cost:    Mapped[float] = mapped_column(Float, nullable=False)
    purpose:       Mapped[str]   = mapped_column(String(500), nullable=True)
    activity_type: Mapped[str]   = mapped_column(String(50),  nullable=True)
    created_at:    Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    cycle: Mapped["CropCycle"] = relationship("CropCycle", back_populates="issues")


class ActivityLog(Base):
    __tablename__ = "activity_logs"
    id:            Mapped[str]   = mapped_column(String(50), primary_key=True)
    cycle_id:      Mapped[str]   = mapped_column(String(50), ForeignKey("crop_cycles.id"), nullable=True)
    plot_id:       Mapped[str]   = mapped_column(String(50), nullable=True)
    plot_label:    Mapped[str]   = mapped_column(String(100), nullable=True)
    activity_type: Mapped[str]   = mapped_column(String(50),  nullable=True)
    notes:         Mapped[str]   = mapped_column(String(1000), nullable=True)
    date_performed:Mapped[date]  = mapped_column(Date, nullable=False)
    workers:       Mapped[int]   = mapped_column(Integer, default=0)
    created_at:    Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    cycle: Mapped["CropCycle"] = relationship("CropCycle", back_populates="activities")


class LabourLog(Base):
    __tablename__ = "labour_logs"
    id:              Mapped[str]   = mapped_column(String(50), primary_key=True)
    labour_type_id:  Mapped[str]   = mapped_column(String(50), nullable=True)
    labour_name:     Mapped[str]   = mapped_column(String(200), nullable=True)
    plot_id:         Mapped[str]   = mapped_column(String(50),  nullable=True)
    plot_label:      Mapped[str]   = mapped_column(String(100), nullable=True)
    date:            Mapped[date]  = mapped_column(Date, nullable=False)
    workers:         Mapped[int]   = mapped_column(Integer, default=0)
    hours:           Mapped[float] = mapped_column(Float, default=0)
    rate_per_day:    Mapped[float] = mapped_column(Float, default=0)
    total_cost:      Mapped[float] = mapped_column(Float, default=0)
    purpose:         Mapped[str]   = mapped_column(String(500), nullable=True)
    created_at:      Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# avoid circular import
from models.master import Plot, Crop  # noqa: E402, F401
