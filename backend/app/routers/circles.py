from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..deps import get_current_user
from ..models import Circle, Friendship, User
from ..schemas import CircleCreate, CircleOut, CircleUpdate, UserPublic

router = APIRouter(prefix="/circles", tags=["circles"])


async def _friend_ids(db: AsyncSession, user_id: int) -> set[int]:
    r = await db.execute(
        select(Friendship).where(
            and_(
                Friendship.status == "accepted",
                or_(Friendship.requester_id == user_id, Friendship.addressee_id == user_id),
            )
        )
    )
    ids = set()
    for f in r.scalars().all():
        ids.add(f.addressee_id if f.requester_id == user_id else f.requester_id)
    return ids


@router.get("", response_model=list[CircleOut])
async def list_circles(db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    r = await db.execute(
        select(Circle).where(Circle.owner_id == me.id).options(selectinload(Circle.members))
    )
    return r.scalars().all()


@router.post("", response_model=CircleOut)
async def create_circle(payload: CircleCreate, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    circle = Circle(owner_id=me.id, name=payload.name, color=payload.color)
    if payload.member_ids:
        friends = await _friend_ids(db, me.id)
        member_ids = [mid for mid in payload.member_ids if mid in friends]
        if member_ids:
            r = await db.execute(select(User).where(User.id.in_(member_ids)))
            circle.members = list(r.scalars().all())
    db.add(circle)
    await db.commit()
    await db.refresh(circle, ["members"])
    return circle


@router.patch("/{circle_id}", response_model=CircleOut)
async def update_circle(
    circle_id: int,
    payload: CircleUpdate,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    r = await db.execute(
        select(Circle).where(Circle.id == circle_id, Circle.owner_id == me.id).options(selectinload(Circle.members))
    )
    circle = r.scalar_one_or_none()
    if not circle:
        raise HTTPException(status_code=404, detail="Not found")

    if payload.name is not None:
        circle.name = payload.name
    if payload.color is not None:
        circle.color = payload.color
    if payload.member_ids is not None:
        friends = await _friend_ids(db, me.id)
        member_ids = [mid for mid in payload.member_ids if mid in friends]
        r2 = await db.execute(select(User).where(User.id.in_(member_ids))) if member_ids else None
        circle.members = list(r2.scalars().all()) if r2 else []
    await db.commit()
    await db.refresh(circle, ["members"])
    return circle


@router.delete("/{circle_id}", status_code=204)
async def delete_circle(circle_id: int, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    r = await db.execute(select(Circle).where(Circle.id == circle_id, Circle.owner_id == me.id))
    circle = r.scalar_one_or_none()
    if not circle:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(circle)
    await db.commit()
