from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_current_user
from ..models import Notification, User
from ..schemas import NotificationOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _deep_link_for(n: Notification) -> str:
    """Return the frontend path a notification should navigate to."""
    data = n.data or {}
    if n.kind == "friend_request":
        return "/friends"
    if n.kind == "friend_accepted":
        # Show the friend's most recent activity via feed anchor if possible.
        uid = data.get("user_id")
        return f"/friends#user-{uid}" if uid else "/friends"
    if n.kind == "activity":
        aid = data.get("activity_id")
        return f"/#activity-{aid}" if aid else "/"
    if n.kind == "reaction":
        aid = data.get("activity_id")
        return f"/#activity-{aid}" if aid else "/"
    return "/notifications"


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


@router.post("/{notif_id}/open")
async def open_notification(notif_id: int, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    """Mark a notification as read and return the frontend deep-link path.

    Called when the user taps a notification card. Idempotent.
    """
    n = await db.get(Notification, notif_id)
    if not n or n.user_id != me.id:
        raise HTTPException(status_code=404, detail="Not found")
    if not n.read:
        n.read = True
        await db.commit()
    return {"path": _deep_link_for(n), "notification": NotificationOut.model_validate(n).model_dump()}


@router.post("/read-all", status_code=204)
async def mark_all_read(db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    r = await db.execute(select(Notification).where(Notification.user_id == me.id, Notification.read.is_(False)))
    for n in r.scalars().all():
        n.read = True
    await db.commit()


@router.post("/read-kind/{kind}", status_code=204)
async def mark_kind_read(
    kind: str, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)
):
    """Mark every unread notification of a given kind (e.g. 'activity') as read."""
    r = await db.execute(
        select(Notification).where(
            Notification.user_id == me.id,
            Notification.read.is_(False),
            Notification.kind == kind,
        )
    )
    for n in r.scalars().all():
        n.read = True
    await db.commit()
