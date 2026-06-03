import time
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import date
from database import get_db
from models.ops import ActivityLog, LabourLog

router = APIRouter()

class ActivityIn(BaseModel):
    cycle_id: str | None = None; plot_id: str = ""; plot_label: str = ""
    activity_type: str; notes: str = ""; date_performed: date; workers: int = 0

class LabourLogIn(BaseModel):
    labour_type_id: str; labour_name: str
    plot_id: str = ""; plot_label: str = ""; date: date
    workers: int; hours: float; rate_per_day: float; purpose: str = ""

@router.get("/")
def list_activities(db: Session = Depends(get_db)):
    return db.query(ActivityLog).order_by(ActivityLog.date_performed.desc()).all()

@router.post("/")
def log_activity(data: ActivityIn, db: Session = Depends(get_db)):
    a = ActivityLog(id=f"ac{int(time.time()*1000)}", **data.model_dump())
    db.add(a); db.commit(); db.refresh(a); return a

@router.get("/labour")
def list_labour_logs(db: Session = Depends(get_db)):
    return db.query(LabourLog).order_by(LabourLog.date.desc()).all()

@router.post("/labour")
def log_labour(data: LabourLogIn, db: Session = Depends(get_db)):
    l = LabourLog(id=f"ll{int(time.time()*1000)}",
                  total_cost=data.workers * data.rate_per_day, **data.model_dump())
    db.add(l); db.commit(); db.refresh(l); return l
