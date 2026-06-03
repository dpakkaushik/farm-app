import uuid
from fastapi import APIRouter, Depends, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models.media import MediaFile

router = APIRouter()

BUCKET_MAP = {
    "inventory_purchase": "inventory-docs",
    "crop_health_log": "farm-photos",
    "harvest": "harvest-docs",
    "sale": "sales-docs",
    "daily_diary": "diary-media",
    "plot_overlay": "farm-photos",
}


@router.post("/upload")
async def upload_file(
    entity_type: str = Form(...),
    entity_id: uuid.UUID = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    from config import settings
    from supabase import create_client

    bucket = BUCKET_MAP.get(entity_type, "farm-photos")
    path = f"{entity_type}/{entity_id}/{uuid.uuid4()}_{file.filename}"
    content = await file.read()

    sb = create_client(settings.supabase_url, settings.supabase_service_key)
    sb.storage.from_(bucket).upload(path, content, {"content-type": file.content_type})

    public_url = sb.storage.from_(bucket).get_public_url(path)

    media = MediaFile(
        entity_type=entity_type,
        entity_id=entity_id,
        file_type="image" if file.content_type.startswith("image/") else "pdf",
        bucket=bucket,
        storage_path=path,
        original_name=file.filename,
        file_size_bytes=len(content),
        mime_type=file.content_type,
        uploaded_by=uuid.UUID(user["sub"]),
    )
    db.add(media)
    await db.commit()
    await db.refresh(media)
    return {"id": str(media.id), "storage_path": path, "public_url": public_url}
