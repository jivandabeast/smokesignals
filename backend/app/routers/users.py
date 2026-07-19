import os
import uuid
from pathlib import Path

import aiofiles
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..schemas import UserOut, UserPublic, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])
settings = get_settings()

ALLOWED_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


@router.get("/search", response_model=list[UserPublic])
async def search_users(q: str, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    q = q.strip()
    if not q:
        return []
    pattern = f"%{q}%"
    result = await db.execute(
        select(User)
        .where(or_(User.username.ilike(pattern), User.nickname.ilike(pattern)))
        .where(User.id != me.id)
        .limit(25)
    )
    return result.scalars().all()


@router.patch("/me", response_model=UserOut)
async def update_me(payload: UserUpdate, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(me, k, v)
    await db.commit()
    await db.refresh(me)
    return me


@router.post("/me/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_IMAGE_EXT:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported image type")

    os.makedirs(settings.upload_dir, exist_ok=True)
    name = f"{uuid.uuid4().hex}{ext}"
    dst = os.path.join(settings.upload_dir, name)

    total = 0
    async with aiofiles.open(dst, "wb") as f:
        while chunk := await file.read(64 * 1024):
            total += len(chunk)
            if total > settings.max_upload_bytes:
                await f.close()
                os.remove(dst)
                raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large")
            await f.write(chunk)

    me.profile_picture = f"/uploads/{name}"
    await db.commit()
    await db.refresh(me)
    return me


@router.get("/{user_id}", response_model=UserPublic)
async def get_user(user_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Not found")
    return user
