from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from models.master import Crop, CropActivityTemplate

router = APIRouter()

class TemplateIn(BaseModel):
    day_number: int
    activity_type: str
    label: str
    inputs: str = ""

class CropIn(BaseModel):
    id: str
    name: str
    emoji: str | None = None
    map_color: str | None = None
    map_outline: str | None = None
    duration_days: int | None = None
    price_per_qtl: float | None = None
    yield_per_acre: float | None = None
    activities: list[TemplateIn] = []

@router.get("/")
def list_crops(db: Session = Depends(get_db)):
    result = []
    for c in db.query(Crop).all():
        templates = db.query(CropActivityTemplate).filter(
            CropActivityTemplate.crop_id == c.id
        ).order_by(CropActivityTemplate.day_number).all()
        result.append({
            "id": c.id, "name": c.name, "emoji": c.emoji,
            "map_color": c.map_color, "map_outline": c.map_outline,
            "duration_days": c.duration_days,
            "price_per_qtl": c.price_per_qtl, "yield_per_acre": c.yield_per_acre,
            "activities": [
                {"day": t.day_number, "type": t.activity_type,
                 "label": t.label, "inputs": t.inputs.split(",") if t.inputs else []}
                for t in templates
            ],
        })
    return result

@router.post("/")
def create_crop(data: CropIn, db: Session = Depends(get_db)):
    crop = Crop(id=data.id, name=data.name, emoji=data.emoji,
                map_color=data.map_color, map_outline=data.map_outline,
                duration_days=data.duration_days,
                price_per_qtl=data.price_per_qtl, yield_per_acre=data.yield_per_acre)
    db.add(crop)
    for a in data.activities:
        db.add(CropActivityTemplate(crop_id=data.id, **a.model_dump()))
    db.commit(); return {"ok": True}

@router.delete("/{crop_id}")
def delete_crop(crop_id: str, db: Session = Depends(get_db)):
    from models.ops import CropCycle
    in_use = db.query(CropCycle).filter(
        CropCycle.crop_id == crop_id, CropCycle.status == "active").count()
    if in_use:
        raise HTTPException(400, f"Cannot delete - {in_use} active cycles use this crop")
    c = db.query(Crop).filter(Crop.id == crop_id).first()
    if not c: raise HTTPException(404)
    db.delete(c); db.commit(); return {"ok": True}
