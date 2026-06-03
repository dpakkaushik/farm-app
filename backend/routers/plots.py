from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from models.master import Plot

router = APIRouter()

class PlotIn(BaseModel):
    id: str
    name: str
    area_acres: float = 0
    soil_type: str | None = None
    water_source: str | None = None
    notes: str | None = None

@router.get("/")
def list_plots(db: Session = Depends(get_db)):
    return db.query(Plot).all()

@router.post("/")
def create_plot(data: PlotIn, db: Session = Depends(get_db)):
    p = Plot(**data.model_dump())
    db.add(p); db.commit(); db.refresh(p); return p

@router.put("/{plot_id}")
def update_plot(plot_id: str, data: PlotIn, db: Session = Depends(get_db)):
    p = db.query(Plot).filter(Plot.id == plot_id).first()
    if not p: raise HTTPException(404, "Plot not found")
    for k, v in data.model_dump().items(): setattr(p, k, v)
    db.commit(); db.refresh(p); return p

@router.delete("/{plot_id}")
def delete_plot(plot_id: str, db: Session = Depends(get_db)):
    p = db.query(Plot).filter(Plot.id == plot_id).first()
    if not p: raise HTTPException(404)
    db.delete(p); db.commit(); return {"ok": True}
