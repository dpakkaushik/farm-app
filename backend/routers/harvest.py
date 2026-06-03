import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import require_manager
from models.harvest import Harvest
from schemas.harvest import HarvestCreate, HarvestRead

router = APIRouter()


@router.post("/cycles/{cycle_id}/harvest", response_model=HarvestRead)
async def record_harvest(cycle_id: uuid.UUID, body: HarvestCreate, db: AsyncSession = Depends(get_db), user=Depends(require_manager)):
    harvest = Harvest(**body.model_dump(), crop_cycle_id=cycle_id)
    db.add(harvest)
    await db.commit()
    await db.refresh(harvest)
    return harvest
