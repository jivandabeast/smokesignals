import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_admin_user, get_current_user
from ..models import ActivityType, ActivityTypeGroup, User
from ..schemas import (
    ActivityTypeCreate,
    ActivityTypeGroupCreate,
    ActivityTypeGroupOut,
    ActivityTypeGroupUpdate,
    ActivityTypeOut,
    ActivityTypeUpdate,
    UserActivityTypeCreate,
)

router = APIRouter(prefix="/activity-types", tags=["activity-types"])


def _slugify(label: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")
    return s or "custom"


# ---------- Groups (must be declared BEFORE /{type_id} so path matching wins) ----------


@router.get("/groups", response_model=list[ActivityTypeGroupOut])
async def list_groups(
    db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)
):
    q = (
        select(ActivityTypeGroup)
        .where(
            ActivityTypeGroup.is_active.is_(True),
            or_(ActivityTypeGroup.owner_id.is_(None), ActivityTypeGroup.owner_id == me.id),
        )
        .order_by(ActivityTypeGroup.sort_order, ActivityTypeGroup.name)
    )
    r = await db.execute(q)
    return r.scalars().all()


@router.post("/groups", response_model=ActivityTypeGroupOut)
async def create_group(
    payload: ActivityTypeGroupCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    g = ActivityTypeGroup(**payload.model_dump())
    db.add(g)
    await db.commit()
    await db.refresh(g)
    return g


@router.post("/groups/mine", response_model=ActivityTypeGroupOut)
async def create_my_group(
    payload: ActivityTypeGroupCreate,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    g = ActivityTypeGroup(owner_id=me.id, **payload.model_dump())
    db.add(g)
    await db.commit()
    await db.refresh(g)
    return g


@router.patch("/groups/{group_id}", response_model=ActivityTypeGroupOut)
async def update_group(
    group_id: int,
    payload: ActivityTypeGroupUpdate,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    g = await db.get(ActivityTypeGroup, group_id)
    if not g:
        raise HTTPException(status_code=404, detail="Not found")
    if g.owner_id is None:
        if not me.is_admin:
            raise HTTPException(status_code=403, detail="Admin only")
    elif g.owner_id != me.id:
        raise HTTPException(status_code=403, detail="Not your group")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(g, k, v)
    await db.commit()
    await db.refresh(g)
    return g


@router.delete("/groups/{group_id}", status_code=204)
async def delete_group(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    g = await db.get(ActivityTypeGroup, group_id)
    if not g:
        raise HTTPException(status_code=404, detail="Not found")
    if g.owner_id is None:
        if not me.is_admin:
            raise HTTPException(status_code=403, detail="Admin only")
    elif g.owner_id != me.id:
        raise HTTPException(status_code=403, detail="Not your group")
    await db.delete(g)
    await db.commit()


# ---------- Types ----------


@router.get("", response_model=list[ActivityTypeOut])
async def list_types(
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """Return global (admin-owned) types + the caller's own custom types."""
    q = (
        select(ActivityType)
        .where(or_(ActivityType.owner_id.is_(None), ActivityType.owner_id == me.id))
        .order_by(ActivityType.sort_order, ActivityType.label)
    )
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


@router.post("/mine", response_model=ActivityTypeOut)
async def create_my_type(
    payload: UserActivityTypeCreate,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """Any user can create a private activity type visible only to them.

    Slug is auto-generated and namespaced by user id so it can't collide with
    admin-defined types or other users' types.
    """
    base_slug = _slugify(payload.label)
    slug = f"u{me.id}-{base_slug}"
    existing = await db.scalar(select(ActivityType).where(ActivityType.slug == slug))
    if existing:
        slug = f"{slug}-{uuid.uuid4().hex[:6]}"

    group_id = payload.group_id
    if group_id is not None:
        g = await db.get(ActivityTypeGroup, group_id)
        if not g or (g.owner_id is not None and g.owner_id != me.id):
            raise HTTPException(status_code=400, detail="Invalid group")

    at = ActivityType(
        slug=slug,
        label=payload.label,
        emoji=payload.emoji,
        color=payload.color,
        group_id=group_id,
        owner_id=me.id,
        is_active=True,
    )
    db.add(at)
    await db.commit()
    await db.refresh(at)
    return at


@router.patch("/{type_id}", response_model=ActivityTypeOut)
async def update_type(
    type_id: int,
    payload: ActivityTypeUpdate,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    at = await db.get(ActivityType, type_id)
    if not at:
        raise HTTPException(status_code=404, detail="Not found")
    if at.owner_id is None:
        if not me.is_admin:
            raise HTTPException(status_code=403, detail="Admin only")
    elif at.owner_id != me.id:
        raise HTTPException(status_code=403, detail="Not your type")

    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(at, k, v)
    await db.commit()
    await db.refresh(at)
    return at


@router.delete("/{type_id}", status_code=204)
async def delete_type(
    type_id: int,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    at = await db.get(ActivityType, type_id)
    if not at:
        raise HTTPException(status_code=404, detail="Not found")
    if at.owner_id is None:
        if not me.is_admin:
            raise HTTPException(status_code=403, detail="Admin only")
    elif at.owner_id != me.id:
        raise HTTPException(status_code=403, detail="Not your type")
    await db.delete(at)
    await db.commit()
