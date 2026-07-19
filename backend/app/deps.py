from typing import Optional

from fastapi import Cookie, Depends, Header, HTTPException, status
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
    user = result.scalar_one_or_none()
    if user is None:
        # Auto-provision on first sight (mirrors the /cf-exchange behaviour).
        base_username = email.split("@")[0]
        username = base_username
        i = 1
        while await db.scalar(select(User).where(User.username == username)):
            i += 1
            username = f"{base_username}{i}"
        user = User(
            email=email,
            username=username,
            nickname=claims.get("name") or base_username,
            hashed_password=None,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    return user


async def get_current_user(
    authorization: Optional[str] = Header(default=None),
    cf_access_jwt_header: Optional[str] = Header(default=None, alias="Cf-Access-Jwt-Assertion"),
    cf_authorization_cookie: Optional[str] = Cookie(default=None, alias="CF_Authorization"),
    db: AsyncSession = Depends(get_db),
) -> User:
    user: Optional[User] = None

    # 1. Prefer a local Bearer token if one is present.
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        user = await _user_from_local_jwt(token, db)
        if user is None and settings.cloudflare_access_enabled:
            user = await _user_from_cf_jwt(token, db)

    # 2. Otherwise, try Cloudflare Access's service-token header.
    if user is None and settings.cloudflare_access_enabled and cf_access_jwt_header:
        user = await _user_from_cf_jwt(cf_access_jwt_header, db)

    # 3. Finally, fall back to the CF_Authorization cookie set by the browser
    #    after an interactive Cloudflare Access login.
    if user is None and settings.cloudflare_access_enabled and cf_authorization_cookie:
        user = await _user_from_cf_jwt(cf_authorization_cookie, db)

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User disabled")
    return user


async def get_admin_user(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user
