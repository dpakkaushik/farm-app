from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import date, timedelta
from database import get_db
from models.master import Crop, Plot
from models.ops import CropCycle

router = APIRouter()

class CycleIn(BaseModel):
    plot_id: str
    crop_id: str
    sow_date: date
    acres: float

class HarvestIn(BaseModel):
    actual_harvest_date: date
    harvest_qtl: float
    quality: str = "A"
    buyer: str = ""
    revenue: float = 0

@router.get("/")
def list_cycles(db: Session = Depends(get_db)):
    cycles = db.query(CropCycle).all()
    result = []
    for c in cycles:
        crop = db.query(Crop).filter(Crop.id == c.crop_id).first()
        plot = db.query(Plot).filter(Plot.id == c.plot_id).first()
        result.append({
            "id": c.id, "plot_id": c.plot_id, "plot_label": plot.name if plot else c.plot_id,
            "crop_id": c.crop_id, "crop_name": crop.name if crop else c.crop_id,
            "crop_emoji": crop.emoji if crop else "🌾",
            "sow_date": c.sow_date, "expected_harvest_date": c.expected_harvest_date,
            "actual_harvest_date": c.actual_harvest_date,
            "status": c.status, "acres": c.acres,
            "harvest_qtl": c.harvest_qtl, "revenue": c.revenue,
        })
    return result

@router.post("/")
def start_cycle(data: CycleIn, db: Session = Depends(get_db)):
    import time
    crop = db.query(Crop).filter(Crop.id == data.crop_id).first()
    if not crop: raise HTTPException(404, "Crop not found")
    plot = db.query(Plot).filter(Plot.id == data.plot_id).first()
    if not plot: raise HTTPException(404, "Plot not found")
    harvest_date = data.sow_date + timedelta(days=crop.duration_days or 120)
    cycle = CropCycle(
        id=f"cc{int(time.time()*1000)}",
        plot_id=data.plot_id, crop_id=data.crop_id,
        sow_date=data.sow_date, expected_harvest_date=harvest_date,
        status="active", acres=data.acres,
    )
    db.add(cycle); db.commit(); db.refresh(cycle)
    return cycle

@router.put("/{cycle_id}/harvest")
def record_harvest(cycle_id: str, data: HarvestIn, db: Session = Depends(get_db)):
    c = db.query(CropCycle).filter(CropCycle.id == cycle_id).first()
    if not c: raise HTTPException(404)
    c.status = "harvested"
    c.actual_harvest_date = data.actual_harvest_date
    c.harvest_qtl = data.harvest_qtl
    c.quality = data.quality
    c.buyer = data.buyer
    c.revenue = data.revenue
    db.commit(); db.refresh(c)
    return c
