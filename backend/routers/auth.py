from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from jose import jwt

from config import settings
from dependencies import get_current_user

router = APIRouter()


class LoginRequest(BaseModel):
    supabase_access_token: str  # client obtains this from Supabase Auth SDK
    role: str                   # "owner" | "manager"


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest):
    """
    Exchange a Supabase access token for an app JWT that includes the role claim.
    In production, verify the Supabase token with Supabase Admin API before issuing.
    """
    if body.role not in ("owner", "manager"):
        raise HTTPException(400, "Invalid role")

    payload = {
        "sub": "placeholder-user-id",   # replace with Supabase user ID after verification
        "role": body.role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return {"access_token": token}


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return user
