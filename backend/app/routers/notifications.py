from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_current_user
from ..models import Notification, User
from ..schemas import NotificationOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    r = await db.execute(
        select(Notification)
        .where(Notification.user_id == me.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    return r.scalars().all()


@router.post("/{notif_id}/read", response_model=NotificationOut)
async def mark_read(notif_id: int, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    n = await db.get(Notification, notif_id)
    if not n or n.user_id != me.id:
        raise HTTPException(status_code=404, detail="Not found")
    n.read = True
    await db.commit()
    await db.refresh(n)
    return n


@router.post("/read-all", status_code=204)
async def mark_all_read(db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    r = await db.execute(select(Notification).where(Notification.user_id == me.id, Notification.read.is_(False)))
    for n in r.scalars().all():
        n.read = True
    await db.commit()
