from collections import defaultdict
from datetime import datetime, timedelta, timezone
from math import asin, cos, radians, sin, sqrt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..deps import get_current_user
from ..models import Activity, ActivityType, Circle, Friendship, Notification, User
from ..push import send_push_to_user
from ..schemas import ActivityCreate, ActivityOut, StatsOut

router = APIRouter(prefix="/activities", tags=["activities"])


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


@router.post("", response_model=ActivityOut)
async def create_activity(
    payload: ActivityCreate,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    at = await db.get(ActivityType, payload.activity_type_id)
    if not at or not at.is_active:
        raise HTTPException(status_code=400, detail="Invalid activity type")

    lat = payload.latitude if me.location_opt_in else None
    lon = payload.longitude if me.location_opt_in else None

    activity = Activity(
        user_id=me.id,
        activity_type_id=at.id,
        note=payload.note,
        latitude=lat,
        longitude=lon,
        place_label=payload.place_label if me.location_opt_in else None,
    )

    audience_ids: set[int] = set()
    if payload.circle_ids:
        r = await db.execute(
            select(Circle)
            .where(Circle.id.in_(payload.circle_ids), Circle.owner_id == me.id)
            .options(selectinload(Circle.members))
        )
        selected = list(r.scalars().all())
        activity.circles = selected
        for c in selected:
            for m in c.members:
                audience_ids.add(m.id)
    else:
        audience_ids = await _friend_ids(db, me.id)

    db.add(activity)
    await db.flush()

    for uid in audience_ids:
        db.add(
            Notification(
                user_id=uid,
                kind="activity",
                title=f"{me.nickname} is {at.label.lower()}",
                body=payload.note or "Tap to join the vibe",
                data={"activity_id": activity.id, "user_id": me.id},
            )
        )

    await db.commit()

    for uid in audience_ids:
        await send_push_to_user(
            db,
            uid,
            f"{me.nickname} is {at.label.lower()}",
            payload.note or "Tap to join",
            {"kind": "activity", "activity_id": activity.id, "user_id": me.id},
        )

    r = await db.execute(
        select(Activity)
        .where(Activity.id == activity.id)
        .options(selectinload(Activity.user), selectinload(Activity.activity_type))
    )
    return r.scalar_one()


@router.get("/feed", response_model=list[ActivityOut])
async def feed(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    friends = await _friend_ids(db, me.id)
    ids = friends | {me.id}
    r = await db.execute(
        select(Activity)
        .where(Activity.user_id.in_(ids))
        .order_by(Activity.created_at.desc())
        .limit(limit)
        .options(selectinload(Activity.user), selectinload(Activity.activity_type))
    )
    return r.scalars().all()


@router.get("/mine", response_model=list[ActivityOut])
async def mine(
    limit: int = 500,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    r = await db.execute(
        select(Activity)
        .where(Activity.user_id == me.id)
        .order_by(Activity.created_at.desc())
        .limit(limit)
        .options(selectinload(Activity.user), selectinload(Activity.activity_type))
    )
    return r.scalars().all()


@router.delete("/{activity_id}", status_code=204)
async def delete_activity(
    activity_id: int, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)
):
    a = await db.get(Activity, activity_id)
    if not a or a.user_id != me.id:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(a)
    await db.commit()


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = radians(lat1), radians(lat2)
    dp = radians(lat2 - lat1)
    dl = radians(lon2 - lon1)
    a = sin(dp / 2) ** 2 + cos(p1) * cos(p2) * sin(dl / 2) ** 2
    return 2 * r * asin(sqrt(a))


@router.get("/nearby-label")
async def nearby_label(
    latitude: float,
    longitude: float,
    accuracy: float | None = None,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """Return a previously used place label for a nearby past activity, if any.

    The search radius is clamped between 60 m and 500 m and always at least as wide
    as the browser-reported horizontal accuracy of the current fix, so a sloppy
    desktop fix doesn't wrongly reuse a label from a mile away.
    """
    if not me.location_opt_in:
        return {"place_label": None, "distance_m": None}

    base_radius = 120.0
    radius = max(base_radius, min(500.0, accuracy or 0.0))

    delta_lat = radius / 111_000.0
    lat_denom = max(cos(radians(latitude)), 0.01)
    delta_lon = radius / (111_000.0 * lat_denom)

    r = await db.execute(
        select(Activity)
        .where(
            Activity.user_id == me.id,
            Activity.place_label.isnot(None),
            Activity.latitude.isnot(None),
            Activity.longitude.isnot(None),
            Activity.latitude.between(latitude - delta_lat, latitude + delta_lat),
            Activity.longitude.between(longitude - delta_lon, longitude + delta_lon),
        )
        .order_by(Activity.created_at.desc())
        .limit(50)
    )
    candidates = list(r.scalars().all())
    best_label: str | None = None
    best_dist: float | None = None
    for a in candidates:
        d = _haversine_m(latitude, longitude, a.latitude, a.longitude)
        if d <= radius and (best_dist is None or d < best_dist):
            best_dist = d
            best_label = a.place_label
    return {
        "place_label": best_label,
        "distance_m": round(best_dist, 1) if best_dist is not None else None,
        "radius_m": round(radius, 1),
    }


@router.get("/stats", response_model=StatsOut)
async def stats(db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    r = await db.execute(
        select(Activity)
        .where(Activity.user_id == me.id)
        .options(selectinload(Activity.activity_type))
    )
    acts = list(r.scalars().all())

    by_type: dict[str, int] = defaultdict(int)
    by_weekday: dict[str, int] = defaultdict(int)
    by_hour: dict[str, int] = defaultdict(int)
    last_30: dict[str, int] = defaultdict(int)

    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)
    weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    for a in acts:
        by_type[a.activity_type.label] += 1
        by_weekday[weekdays[a.created_at.weekday()]] += 1
        by_hour[str(a.created_at.hour)] += 1
        if a.created_at >= thirty_days_ago:
            last_30[a.created_at.date().isoformat()] += 1

    # streak: consecutive days back from today with at least one activity
    days_with = {a.created_at.date() for a in acts}
    streak = 0
    day = now.date()
    while day in days_with:
        streak += 1
        day = day - timedelta(days=1)

    return StatsOut(
        total=len(acts),
        by_type=dict(by_type),
        by_weekday={d: by_weekday.get(d, 0) for d in weekdays},
        by_hour={str(h): by_hour.get(str(h), 0) for h in range(24)},
        streak_days=streak,
        last_30_days=dict(last_30),
    )
