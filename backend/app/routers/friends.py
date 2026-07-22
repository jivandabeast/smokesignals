from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..deps import get_current_user
from ..models import Friendship, Notification, User
from ..push import send_push_to_user
from ..schemas import FriendRequestOut, UserPublic

router = APIRouter(prefix="/friends", tags=["friends"])


async def _get_pair(db: AsyncSession, a: int, b: int) -> Friendship | None:
    r = await db.execute(
        select(Friendship).where(
            or_(
                and_(Friendship.requester_id == a, Friendship.addressee_id == b),
                and_(Friendship.requester_id == b, Friendship.addressee_id == a),
            )
        )
    )
    return r.scalar_one_or_none()


@router.get("", response_model=list[UserPublic])
async def list_friends(db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    r = await db.execute(
        select(Friendship).where(
            and_(
                Friendship.status == "accepted",
                or_(Friendship.requester_id == me.id, Friendship.addressee_id == me.id),
            )
        )
    )
    friends: list[User] = []
    other_ids = []
    for f in r.scalars().all():
        other_ids.append(f.addressee_id if f.requester_id == me.id else f.requester_id)
    if other_ids:
        r2 = await db.execute(select(User).where(User.id.in_(other_ids)))
        friends = list(r2.scalars().all())
    return friends


@router.get("/requests", response_model=list[FriendRequestOut])
async def list_requests(db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    r = await db.execute(
        select(Friendship)
        .where(and_(Friendship.status == "pending", Friendship.addressee_id == me.id))
        .options()
    )
    items = []
    for f in r.scalars().all():
        req_user = await db.get(User, f.requester_id)
        addr_user = await db.get(User, f.addressee_id)
        items.append(
            FriendRequestOut(
                id=f.id,
                requester=UserPublic.model_validate(req_user),
                addressee=UserPublic.model_validate(addr_user),
                status=f.status,
                created_at=f.created_at,
            )
        )
    return items


@router.post("/request/{user_id}", response_model=FriendRequestOut)
async def send_request(user_id: int, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    if user_id == me.id:
        raise HTTPException(status_code=400, detail="Cannot friend yourself")
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    existing = await _get_pair(db, me.id, user_id)
    if existing:
        raise HTTPException(status_code=409, detail=f"Existing relationship: {existing.status}")

    f = Friendship(requester_id=me.id, addressee_id=user_id, status="pending")
    db.add(f)
    await db.flush()
    n = Notification(
        user_id=user_id,
        kind="friend_request",
        title=f"{me.nickname} wants to connect",
        body="Tap to review the request",
        data={"from_user_id": me.id, "request_id": f.id},
    )
    db.add(n)
    await db.commit()
    await db.refresh(f)

    await send_push_to_user(
        db, user_id, "New friend request", f"{me.nickname} wants to connect", {"kind": "friend_request"}
    )

    return FriendRequestOut(
        id=f.id,
        requester=UserPublic.model_validate(me),
        addressee=UserPublic.model_validate(target),
        status=f.status,
        created_at=f.created_at,
    )


@router.post("/respond/{request_id}", response_model=FriendRequestOut)
async def respond(
    request_id: int,
    accept: bool,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    f = await db.get(Friendship, request_id)
    if not f or f.addressee_id != me.id:
        raise HTTPException(status_code=404, detail="Request not found")
    if f.status != "pending":
        raise HTTPException(status_code=400, detail="Already responded")
    f.status = "accepted" if accept else "declined"
    f.responded_at = datetime.now(timezone.utc)

    if accept:
        n = Notification(
            user_id=f.requester_id,
            kind="friend_accepted",
            title=f"{me.nickname} accepted your request",
            data={"user_id": me.id},
        )
        db.add(n)

    await db.commit()
    await db.refresh(f)

    if accept:
        await send_push_to_user(
            db, f.requester_id, "Friend request accepted", f"{me.nickname} is now your friend", {"kind": "friend_accepted"}
        )

    req_user = await db.get(User, f.requester_id)
    addr_user = await db.get(User, f.addressee_id)
    return FriendRequestOut(
        id=f.id,
        requester=UserPublic.model_validate(req_user),
        addressee=UserPublic.model_validate(addr_user),
        status=f.status,
        created_at=f.created_at,
    )


@router.delete("/{user_id}", status_code=204)
async def remove_friend(user_id: int, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    f = await _get_pair(db, me.id, user_id)
    if not f:
        raise HTTPException(status_code=404, detail="Not friends")
    await db.delete(f)
    await db.commit()
