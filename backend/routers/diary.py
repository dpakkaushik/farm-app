import uuid
from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from dependencies import get_current_user, require_manager
from models.diary import DailyDiary
from schemas.diary import DiaryCreate, DiaryRead

router = APIRouter()


@router.post("/", response_model=DiaryRead)
async def submit_diary(farm_id: uuid.UUID, body: DiaryCreate, db: AsyncSession = Depends(get_db), user=Depends(require_manager)):
    entry = DailyDiary(**body.model_dump(), farm_id=farm_id, logged_by=uuid.UUID(user["sub"]))
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.get("/farms/{farm_id}", response_model=list[DiaryRead])
async def list_diary(farm_id: uuid.UUID, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    r = await db.execute(select(DailyDiary).where(DailyDiary.farm_id == farm_id).order_by(DailyDiary.diary_date.desc()).limit(30))
    return r.scalars().all()
