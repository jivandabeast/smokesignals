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

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    username: str
    password: str


class AdminBootstrapStatus(BaseModel):
    needs_bootstrap: bool


class ActivityTypeBase(BaseModel):
    slug: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9_\-]+$")
    label: str = Field(min_length=1, max_length=120)
    emoji: Optional[str] = None
    color: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0


class ActivityTypeCreate(ActivityTypeBase):
    pass


class ActivityTypeUpdate(BaseModel):
    label: Optional[str] = None
    emoji: Optional[str] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class ActivityTypeOut(ActivityTypeBase):
    id: int

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
    circle_ids: Optional[list[int]] = None  # None => share with all friends


class ActivityOut(BaseModel):
    id: int
    user: UserPublic
    activity_type: ActivityTypeOut
    note: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    place_label: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


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
