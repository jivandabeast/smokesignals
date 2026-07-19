from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_admin_user, get_current_user
from ..models import ActivityType, User
from ..schemas import ActivityTypeCreate, ActivityTypeOut, ActivityTypeUpdate

router = APIRouter(prefix="/activity-types", tags=["activity-types"])


@router.get("", response_model=list[ActivityTypeOut])
async def list_types(
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(ActivityType).order_by(ActivityType.sort_order, ActivityType.label)
    if not include_inactive:
        q = q.where(ActivityType.is_active.is_(True))
    r = await db.execute(q)
    return r.scalars().all()


@router.post("", response_model=ActivityTypeOut)
async def create_type(
    payload: ActivityTypeCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    existing = await db.scalar(select(ActivityType).where(ActivityType.slug == payload.slug))
    if existing:
        raise HTTPException(status_code=409, detail="Slug already exists")
    at = ActivityType(**payload.model_dump())
    db.add(at)
    await db.commit()
    await db.refresh(at)
    return at


@router.patch("/{type_id}", response_model=ActivityTypeOut)
async def update_type(
    type_id: int,
    payload: ActivityTypeUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    at = await db.get(ActivityType, type_id)
    if not at:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(at, k, v)
    await db.commit()
    await db.refresh(at)
    return at


@router.delete("/{type_id}", status_code=204)
async def delete_type(
    type_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    at = await db.get(ActivityType, type_id)
    if not at:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(at)
    await db.commit()
