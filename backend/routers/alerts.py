import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from dependencies import get_current_user
from models.alert import Alert
from schemas.alert import AlertRead

router = APIRouter()


@router.get("/farms/{farm_id}", response_model=list[AlertRead])
async def list_alerts(farm_id: uuid.UUID, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    r = await db.execute(select(Alert).where(Alert.farm_id == farm_id, Alert.is_read == False).order_by(Alert.created_at.desc()))
    return r.scalars().all()


@router.put("/{alert_id}/read")
async def mark_read(alert_id: uuid.UUID, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    alert = await db.get(Alert, alert_id)
    if alert:
        alert.is_read = True
        await db.commit()
    return {"ok": True}
