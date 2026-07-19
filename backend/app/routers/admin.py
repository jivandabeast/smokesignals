from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_admin_user
from ..models import User
from ..schemas import UserOut

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=list[UserOut])
async def list_users(db: AsyncSession = Depends(get_db), _: User = Depends(get_admin_user)):
    r = await db.execute(select(User).order_by(User.created_at.desc()))
    return r.scalars().all()


@router.post("/users/{user_id}/set-active", response_model=UserOut)
async def set_active(user_id: int, active: bool, db: AsyncSession = Depends(get_db), _: User = Depends(get_admin_user)):
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    u.is_active = active
    await db.commit()
    await db.refresh(u)
    return u


@router.post("/users/{user_id}/set-admin", response_model=UserOut)
async def set_admin(user_id: int, is_admin: bool, db: AsyncSession = Depends(get_db), _: User = Depends(get_admin_user)):
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    u.is_admin = is_admin
    await db.commit()
    await db.refresh(u)
    return u


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db), me: User = Depends(get_admin_user)):
    if user_id == me.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(u)
    await db.commit()
