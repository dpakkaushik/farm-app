import time
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import date
from database import get_db
from models.master import InventoryItem
from models.ops import InventoryPurchase, InventoryIssue

router = APIRouter()

class ItemIn(BaseModel):
    id: str; name: str; category: str; unit: str
    min_threshold: float = 0; cost_per_unit: float = 0

class PurchaseIn(BaseModel):
    item_id: str; purchase_date: date; qty: float; unit_price: float
    vendor: str; invoice_no: str = ""; notes: str = ""

class IssueIn(BaseModel):
    item_id: str; cycle_id: str | None = None
    plot_id: str = ""; plot_label: str = ""; issue_date: date
    qty: float; purpose: str = ""; activity_type: str = "manual"

@router.get("/items")
def list_items(db: Session = Depends(get_db)): return db.query(InventoryItem).all()

@router.post("/items")
def create_item(data: ItemIn, db: Session = Depends(get_db)):
    item = InventoryItem(**data.model_dump(), current_stock=0)
    db.add(item); db.commit(); db.refresh(item); return item

@router.delete("/items/{item_id}")
def delete_item(item_id: str, db: Session = Depends(get_db)):
    if (db.query(InventoryPurchase).filter(InventoryPurchase.item_id == item_id).count() or
            db.query(InventoryIssue).filter(InventoryIssue.item_id == item_id).count()):
        raise HTTPException(400, "Cannot delete - item has records")
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item: raise HTTPException(404)
    db.delete(item); db.commit(); return {"ok": True}

@router.get("/purchases")
def list_purchases(db: Session = Depends(get_db)):
    return db.query(InventoryPurchase).order_by(InventoryPurchase.purchase_date.desc()).all()

@router.post("/purchases")
def record_purchase(data: PurchaseIn, db: Session = Depends(get_db)):
    item = db.query(InventoryItem).filter(InventoryItem.id == data.item_id).first()
    if not item: raise HTTPException(404, "Item not found")
    p = InventoryPurchase(id=f"pu{int(time.time()*1000)}",
                          total_cost=data.qty * data.unit_price, **data.model_dump())
    item.current_stock += data.qty; item.cost_per_unit = data.unit_price
    db.add(p); db.commit(); return p

@router.get("/issues")
def list_issues(db: Session = Depends(get_db)):
    return db.query(InventoryIssue).order_by(InventoryIssue.issue_date.desc()).all()

@router.post("/issues")
def record_issue(data: IssueIn, db: Session = Depends(get_db)):
    item = db.query(InventoryItem).filter(InventoryItem.id == data.item_id).first()
    if not item: raise HTTPException(404, "Item not found")
    issue = InventoryIssue(id=f"is{int(time.time()*1000)}",
                           total_cost=data.qty * item.cost_per_unit, **data.model_dump())
    item.current_stock = max(0, item.current_stock - data.qty)
    db.add(issue); db.commit(); return issue
