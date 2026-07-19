from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..cloudflare import verify_cf_access_jwt
from ..config import get_settings
from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..schemas import (
    AdminBootstrapStatus,
    LoginRequest,
    Token,
    UserCreate,
    UserOut,
)
from ..security import create_access_token, hash_password, needs_rehash, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


@router.get("/bootstrap-status", response_model=AdminBootstrapStatus)
async def bootstrap_status(db: AsyncSession = Depends(get_db)):
    count = await db.scalar(select(func.count()).select_from(User).where(User.is_admin.is_(True)))
    return AdminBootstrapStatus(needs_bootstrap=(count or 0) == 0)


@router.post("/register-admin", response_model=Token)
async def register_admin(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    """Bootstrap the initial admin user. Only allowed when no admin exists."""
    admin_count = await db.scalar(select(func.count()).select_from(User).where(User.is_admin.is_(True)))
    if (admin_count or 0) > 0:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin already exists")

    existing = await db.scalar(
        select(User).where((User.username == payload.username) | (User.email == payload.email))
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username or email in use")

    user = User(
        email=payload.email,
        username=payload.username,
        nickname=payload.nickname,
        hashed_password=hash_password(payload.password),
        is_admin=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return Token(access_token=create_access_token(user.id))


@router.post("/register", response_model=Token)
async def register(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.scalar(
        select(User).where((User.username == payload.username) | (User.email == payload.email))
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username or email in use")

    user = User(
        email=payload.email,
        username=payload.username,
        nickname=payload.nickname,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return Token(access_token=create_access_token(user.id))


@router.post("/login", response_model=Token)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where((User.username == payload.username) | (User.email == payload.username))
    )
    user = result.scalar_one_or_none()
    if not user or not user.hashed_password or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User disabled")
    if needs_rehash(user.hashed_password):
        user.hashed_password = hash_password(payload.password)
        await db.commit()
    return Token(access_token=create_access_token(user.id))


@router.post("/cf-exchange", response_model=Token)
async def cloudflare_exchange(
    cf_access_jwt: str,
    db: AsyncSession = Depends(get_db),
):
    """Exchange a Cloudflare Access JWT for a local session token. Creates the user if it does not exist."""
    if not settings.cloudflare_access_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cloudflare Access disabled")

    claims = await verify_cf_access_jwt(cf_access_jwt)
    if not claims:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Cloudflare Access JWT")

    email = claims.get("email")
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cloudflare Access JWT missing email")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
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

    return Token(access_token=create_access_token(user.id))


@router.post("/cf-session", response_model=Token)
async def cloudflare_session(
    db: AsyncSession = Depends(get_db),
    cf_access_jwt_header: str | None = Header(default=None, alias="Cf-Access-Jwt-Assertion"),
    cf_authorization_cookie: str | None = Cookie(default=None, alias="CF_Authorization"),
):
    """Read the CF Access JWT from the request (header or cookie) and mint a local session token.

    This is what the frontend calls on boot when no local token exists — it lets the
    interactive browser flow (CF_Authorization cookie) log the user in without ever
    exposing the CF JWT to JavaScript.
    """
    print(
        "[cf-session] enabled=", settings.cloudflare_access_enabled,
        "header?", bool(cf_access_jwt_header),
        "cookie?", bool(cf_authorization_cookie),
        "header_len=", len(cf_access_jwt_header) if cf_access_jwt_header else 0,
        "cookie_len=", len(cf_authorization_cookie) if cf_authorization_cookie else 0,
        flush=True,
    )
    if not settings.cloudflare_access_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cloudflare Access disabled")

    token = cf_access_jwt_header or cf_authorization_cookie
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No Cloudflare Access credentials on request")

    claims = await verify_cf_access_jwt(token)
    if not claims:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Cloudflare Access JWT")

    email = claims.get("email")
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cloudflare Access JWT missing email")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
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

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User disabled")

    return Token(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user
