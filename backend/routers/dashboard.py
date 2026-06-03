import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from schemas.dashboard import DashboardData

router = APIRouter()


@router.get("/farms/{farm_id}", response_model=DashboardData)
async def get_dashboard(farm_id: uuid.UUID, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    # TODO: implement full aggregation — returning empty shell for now
    return DashboardData(
        owner_name="Farm Owner",
        active_plots=0, total_plots=0,
        season_spend=0.0, expected_revenue=0.0,
        manager_last_logged=None,
        plots=[], alerts=[], latest_diary=None,
        low_stock_items=[], upcoming_harvests=[],
    )
