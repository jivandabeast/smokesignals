from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..deps import get_current_user
from ..models import Activity, ActivityType, Notification, Reaction, User
from ..push import send_push_to_user
from ..schemas import ReactionCreate, ReactionSummary, UserPublic
from .activities import _friend_ids

router = APIRouter(prefix="/reactions", tags=["reactions"])


async def _authorize(db: AsyncSession, activity_id: int, me: User) -> Activity:
    activity = await db.get(Activity, activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="Not found")
    if activity.user_id != me.id:
        # Private activities are invisible to friends; treat as 404 so we
        # don't even confirm existence.
        if activity.is_private:
            raise HTTPException(status_code=404, detail="Not found")
        friends = await _friend_ids(db, me.id)
        if activity.user_id not in friends:
            raise HTTPException(status_code=403, detail="Not authorized")
    return activity


async def _summaries(db: AsyncSession, activity_id: int, me_id: int) -> list[ReactionSummary]:
    bulk = await summaries_for_activities(db, [activity_id], me_id)
    return bulk.get(activity_id, [])


async def summaries_for_activities(
    db: AsyncSession, activity_ids: list[int], me_id: int
) -> dict[int, list[ReactionSummary]]:
    """Return reaction summaries keyed by activity id. Empty dict when input is empty."""
    if not activity_ids:
        return {}
    r = await db.execute(
        select(Reaction)
        .where(Reaction.activity_id.in_(activity_ids))
        .order_by(Reaction.created_at.asc())
        .options(selectinload(Reaction.user))
    )
    rows = list(r.scalars().all())
    # activity_id -> emoji -> [Reaction]
    grouped: dict[int, dict[str, list[Reaction]]] = {aid: {} for aid in activity_ids}
    for row in rows:
        grouped.setdefault(row.activity_id, {}).setdefault(row.emoji, []).append(row)
    out: dict[int, list[ReactionSummary]] = {}
    for aid, by_emoji in grouped.items():
        summaries: list[ReactionSummary] = []
        for emoji, items in by_emoji.items():
            summaries.append(
                ReactionSummary(
                    emoji=emoji,
                    count=len(items),
                    mine=any(i.user_id == me_id for i in items),
                    users=[
                        UserPublic(
                            id=i.user.id,
                            username=i.user.username,
                            nickname=i.user.nickname,
                            profile_picture=i.user.profile_picture,
                            contact_platforms=None,
                        )
                        for i in items[:5]
                    ],
                )
            )
        summaries.sort(key=lambda s: (-s.count, s.emoji))
        out[aid] = summaries
    return out


@router.get("/activity/{activity_id}", response_model=list[ReactionSummary])
async def list_reactions(
    activity_id: int,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    await _authorize(db, activity_id, me)
    return await _summaries(db, activity_id, me.id)


@router.post("/activity/{activity_id}", response_model=list[ReactionSummary])
async def toggle_reaction(
    activity_id: int,
    payload: ReactionCreate,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    await _authorize(db, activity_id, me)
    emoji = payload.emoji.strip()
    if not emoji:
        raise HTTPException(status_code=400, detail="Empty emoji")

    existing = await db.execute(
        select(Reaction).where(
            Reaction.activity_id == activity_id,
            Reaction.user_id == me.id,
            Reaction.emoji == emoji,
        )
    )
    row = existing.scalar_one_or_none()
    if row:
        await db.delete(row)
        await db.commit()
    else:
        db.add(Reaction(activity_id=activity_id, user_id=me.id, emoji=emoji))
        await db.commit()
        # Notify the activity owner (unless they're reacting to themselves).
        activity = await db.get(Activity, activity_id)
        if activity and activity.user_id != me.id:
            at = await db.get(ActivityType, activity.activity_type_id)
            label = at.label.lower() if at else "signal"
            title = f"{me.nickname} reacted {emoji}"
            body = f"to your {label}"
            db.add(
                Notification(
                    user_id=activity.user_id,
                    kind="reaction",
                    title=title,
                    body=body,
                    data={"activity_id": activity.id, "user_id": me.id, "emoji": emoji},
                )
            )
            await db.commit()
            await send_push_to_user(
                db,
                activity.user_id,
                title,
                body,
                {"kind": "reaction", "activity_id": activity.id, "user_id": me.id, "emoji": emoji},
            )
    return await _summaries(db, activity_id, me.id)
