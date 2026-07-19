from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .cloudflare import verify_cf_access_jwt
from .config import get_settings
from .database import get_db
from .models import User
from .security import decode_access_token

settings = get_settings()


async def _user_from_local_jwt(token: str, db: AsyncSession) -> Optional[User]:
    try:
        payload = decode_access_token(token)
    except ValueError:
        return None
    sub = payload.get("sub")
    if sub is None:
        return None
    result = await db.execute(select(User).where(User.id == int(sub)))
    return result.scalar_one_or_none()


async def _user_from_cf_jwt(token: str, db: AsyncSession) -> Optional[User]:
    claims = await verify_cf_access_jwt(token)
    if not claims:
        return None
    email = claims.get("email")
    if not email:
        return None
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_current_user(
    authorization: Optional[str] = Header(default=None),
    cf_access_jwt: Optional[str] = Header(default=None, alias="Cf-Access-Jwt-Assertion"),
    db: AsyncSession = Depends(get_db),
) -> User:
    user: Optional[User] = None

    if settings.cloudflare_access_enabled and cf_access_jwt:
        user = await _user_from_cf_jwt(cf_access_jwt, db)

    if user is None and authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        user = await _user_from_local_jwt(token, db)
        if user is None and settings.cloudflare_access_enabled:
            user = await _user_from_cf_jwt(token, db)

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User disabled")
    return user


async def get_admin_user(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user
