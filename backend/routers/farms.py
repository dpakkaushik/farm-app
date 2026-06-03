import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from database import get_db
from dependencies import get_current_user, require_owner
from models.farm import Farm
from models.plot import Plot
from schemas.farm import FarmRead, FarmCreate, FarmUpdate, MapStateUpdate, OverlayConfigUpdate
from schemas.plot import PlotSummary

router = APIRouter()


@router.get("/{farm_id}", response_model=FarmRead)
async def get_farm(farm_id: uuid.UUID, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    farm = await db.get(Farm, farm_id)
    if not farm:
        raise HTTPException(404, "Farm not found")
    return farm


@router.post("/", response_model=FarmRead)
async def create_farm(body: FarmCreate, db: AsyncSession = Depends(get_db), user=Depends(require_owner)):
    farm = Farm(**body.model_dump(), owner_id=uuid.UUID(user["sub"]))
    db.add(farm)
    await db.commit()
    await db.refresh(farm)
    return farm


@router.put("/{farm_id}", response_model=FarmRead)
async def update_farm(farm_id: uuid.UUID, body: FarmUpdate, db: AsyncSession = Depends(get_db), user=Depends(require_owner)):
    farm = await db.get(Farm, farm_id)
    if not farm:
        raise HTTPException(404, "Farm not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(farm, k, v)
    await db.commit()
    await db.refresh(farm)
    return farm


@router.put("/{farm_id}/map-state")
async def save_map_state(farm_id: uuid.UUID, body: MapStateUpdate, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    """Persist the map zoom + center so it restores on next visit."""
    await db.execute(
        update(Farm).where(Farm.id == farm_id).values(map_state=body.model_dump())
    )
    await db.commit()
    return {"saved": True}


@router.put("/{farm_id}/overlay")
async def save_overlay_config(farm_id: uuid.UUID, body: OverlayConfigUpdate, db: AsyncSession = Depends(get_db), user=Depends(require_owner)):
    """Save the plot-layout image overlay configuration (coordinates + opacity)."""
    await db.execute(
        update(Farm).where(Farm.id == farm_id).values(overlay_config=body.model_dump())
    )
    await db.commit()
    return {"saved": True}


@router.get("/{farm_id}/plots", response_model=list[PlotSummary])
async def list_plots(farm_id: uuid.UUID, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(Plot).where(Plot.farm_id == farm_id))
    plots = result.scalars().all()
    return [PlotSummary.model_validate(p) for p in plots]
