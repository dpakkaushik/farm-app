from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from models.master import Labourer, LabourCategory

router = APIRouter()

class LabourerIn(BaseModel):
    id: str | None = None
    name: str
    work_type: str | None = None
    rate_per_day: float = 400
    phone: str = ""

class CategoryIn(BaseModel):
    id: str | None = None
    name: str
    default_rate: float = 400

@router.get("/labourers")
def list_labourers(db: Session = Depends(get_db)):
    return db.query(Labourer).all()

@router.post("/labourers")
def add_labourer(data: LabourerIn, db: Session = Depends(get_db)):
    import time
    l = Labourer(id=data.id or f"rl{int(time.time()*1000)}", name=data.name,
                 work_type=data.work_type, rate_per_day=data.rate_per_day, phone=data.phone)
    db.add(l); db.commit(); db.refresh(l)
    return l

@router.delete("/labourers/{lid}")
def delete_labourer(lid: str, db: Session = Depends(get_db)):
    l = db.query(Labourer).filter(Labourer.id == lid).first()
    if not l: raise HTTPException(404)
    db.delete(l); db.commit()
    return {"ok": True}

@router.get("/categories")
def list_categories(db: Session = Depends(get_db)):
    return db.query(LabourCategory).all()

@router.post("/categories")
def add_category(data: CategoryIn, db: Session = Depends(get_db)):
    import time
    c = LabourCategory(id=data.id or f"cl{int(time.time()*1000)}", name=data.name, default_rate=data.default_rate)
    db.add(c); db.commit(); db.refresh(c)
    return c

@router.delete("/categories/{cid}")
def delete_category(cid: str, db: Session = Depends(get_db)):
    c = db.query(LabourCategory).filter(LabourCategory.id == cid).first()
    if not c: raise HTTPException(404)
    db.delete(c); db.commit()
    return {"ok": True}
