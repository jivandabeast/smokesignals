from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_db
from ..deps import get_current_user
from ..models import PushSubscription, User
from ..schemas import PushSubscriptionIn, VapidPublicKey

router = APIRouter(prefix="/push", tags=["push"])
settings = get_settings()


@router.get("/vapid-public-key", response_model=VapidPublicKey)
async def vapid_public_key():
    return VapidPublicKey(public_key=settings.vapid_public_key)


@router.post("/subscribe", status_code=204)
async def subscribe(
    payload: PushSubscriptionIn,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    p256dh = payload.keys.get("p256dh")
    auth = payload.keys.get("auth")
    if not p256dh or not auth:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing keys")

    existing = await db.scalar(select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint))
    if existing:
        existing.user_id = me.id
        existing.p256dh = p256dh
        existing.auth = auth
    else:
        db.add(PushSubscription(user_id=me.id, endpoint=payload.endpoint, p256dh=p256dh, auth=auth))
    await db.commit()


@router.post("/unsubscribe", status_code=204)
async def unsubscribe(
    payload: PushSubscriptionIn,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    r = await db.execute(
        select(PushSubscription).where(
            PushSubscription.endpoint == payload.endpoint,
            PushSubscription.user_id == me.id,
        )
    )
    sub = r.scalar_one_or_none()
    if sub:
        await db.delete(sub)
        await db.commit()
