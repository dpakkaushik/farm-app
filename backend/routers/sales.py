import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import require_manager
from models.sale import Sale
from schemas.sale import SaleCreate, SaleRead

router = APIRouter()


@router.post("/harvests/{harvest_id}/sales", response_model=SaleRead)
async def record_sale(harvest_id: uuid.UUID, body: SaleCreate, db: AsyncSession = Depends(get_db), user=Depends(require_manager)):
    sale = Sale(**body.model_dump(), harvest_id=harvest_id, total_revenue=body.quantity_sold * body.rate_per_unit)
    db.add(sale)
    await db.commit()
    await db.refresh(sale)
    return sale
