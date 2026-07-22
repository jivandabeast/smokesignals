from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserBase(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_.\-]+$")
    email: EmailStr
    nickname: str = Field(min_length=1, max_length=80)


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)


class UserUpdate(BaseModel):
    nickname: Optional[str] = None
    contact_platforms: Optional[dict] = None
    location_opt_in: Optional[bool] = None
    profile_picture: Optional[str] = None


class UserOut(UserBase):
    id: int
    is_admin: bool
    is_active: bool
    profile_picture: Optional[str] = None
    contact_platforms: Optional[dict] = None
    location_opt_in: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserPublic(BaseModel):
    id: int
    username: str
    nickname: str
    profile_picture: Optional[str] = None
    contact_platforms: Optional[dict] = None

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    username: str
    password: str


class AdminBootstrapStatus(BaseModel):
    needs_bootstrap: bool


class ActivityTypeGroupBase(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    emoji: Optional[str] = None
    color: Optional[str] = None
    sort_order: int = 0
    is_active: bool = True


class ActivityTypeGroupCreate(ActivityTypeGroupBase):
    pass


class ActivityTypeGroupUpdate(BaseModel):
    name: Optional[str] = None
    emoji: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class ActivityTypeGroupOut(ActivityTypeGroupBase):
    id: int
    owner_id: Optional[int] = None

    class Config:
        from_attributes = True


class ActivityTypeBase(BaseModel):
    slug: str = Field(min_length=1, max_length=80, pattern=r"^[a-z0-9_\-]+$")
    label: str = Field(min_length=1, max_length=120)
    emoji: Optional[str] = None
    color: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0
    group_id: Optional[int] = None


class ActivityTypeCreate(ActivityTypeBase):
    pass


class UserActivityTypeCreate(BaseModel):
    """User-defined activity type — auto-slugged from label."""

    label: str = Field(min_length=1, max_length=120)
    emoji: Optional[str] = None
    color: Optional[str] = None
    group_id: Optional[int] = None


class ActivityTypeUpdate(BaseModel):
    label: Optional[str] = None
    emoji: Optional[str] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None
    group_id: Optional[int] = None


class ActivityTypeOut(ActivityTypeBase):
    id: int
    owner_id: Optional[int] = None

    class Config:
        from_attributes = True


class CircleBase(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    color: Optional[str] = None


class CircleCreate(CircleBase):
    member_ids: list[int] = []


class CircleUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    member_ids: Optional[list[int]] = None


class CircleOut(CircleBase):
    id: int
    members: list[UserPublic]

    class Config:
        from_attributes = True


class ActivityCreate(BaseModel):
    activity_type_id: int
    note: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    place_label: Optional[str] = None
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=24 * 60)
    circle_ids: Optional[list[int]] = None  # None => share with all friends
    is_private: bool = False


class ActivityOut(BaseModel):
    id: int
    user: UserPublic
    activity_type: ActivityTypeOut
    note: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    place_label: Optional[str] = None
    duration_minutes: Optional[int] = None
    is_private: bool = False
    created_at: datetime
    reactions: list["ReactionSummary"] = []

    class Config:
        from_attributes = True


class FriendStatusOut(BaseModel):
    """Latest activity summary for a friend, used by the Friends screen."""

    user: UserPublic
    last_activity: Optional[ActivityOut] = None
    # Same-type consecutive count starting from the most recent activity
    # (e.g. 3 beers in a row = 3). None when there is no activity.
    combo: Optional[int] = None
    # Whether last_activity is still "active" (within its duration window,
    # or within a 2-hour freshness fallback when duration is unset).
    is_active_now: bool = False
    # Seconds until the current window ends (positive) or since it ended (negative).
    expires_in_seconds: Optional[int] = None


class FriendRequestOut(BaseModel):
    id: int
    requester: UserPublic
    addressee: UserPublic
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationOut(BaseModel):
    id: int
    kind: str
    title: str
    body: Optional[str] = None
    data: Optional[dict] = None
    read: bool
    created_at: datetime

    class Config:
        from_attributes = True


class PushSubscriptionIn(BaseModel):
    endpoint: str
    keys: dict


class StatsOut(BaseModel):
    total: int
    by_type: dict[str, int]
    by_weekday: dict[str, int]
    by_hour: dict[str, int]
    streak_days: int
    last_30_days: dict[str, int]


class VapidPublicKey(BaseModel):
    public_key: Optional[str]


class ReactionOut(BaseModel):
    id: int
    user: UserPublic
    emoji: str
    created_at: datetime

    class Config:
        from_attributes = True


class ReactionSummary(BaseModel):
    emoji: str
    count: int
    mine: bool
    users: list[UserPublic]


class ReactionCreate(BaseModel):
    emoji: str = Field(min_length=1, max_length=32)


ActivityOut.model_rebuild()
FriendStatusOut.model_rebuild()
