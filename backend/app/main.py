import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from .config import get_settings
from .database import Base, SessionLocal, engine
from .models import ActivityType
from .routers import (
    activities,
    activity_types,
    admin,
    auth,
    circles,
    friends,
    notifications,
    push,
    users,
)

logger = logging.getLogger("smokesignals")
logging.basicConfig(level=logging.INFO)

settings = get_settings()


DEFAULT_ACTIVITY_TYPES = [
    {"slug": "beer", "label": "Having a beer", "emoji": "🍺", "color": "#f2b134", "sort_order": 10},
    {"slug": "wine", "label": "Having wine", "emoji": "🍷", "color": "#7a1e3a", "sort_order": 20},
    {"slug": "cocktail", "label": "Cocktail hour", "emoji": "🍸", "color": "#e94f75", "sort_order": 30},
    {"slug": "coffee", "label": "Coffee break", "emoji": "☕", "color": "#6f4e37", "sort_order": 40},
    {"slug": "smoke", "label": "Having a smoke", "emoji": "🚬", "color": "#767676", "sort_order": 50},
    {"slug": "vape", "label": "Vaping", "emoji": "💨", "color": "#4aa3df", "sort_order": 60},
]


async def seed_defaults():
    async with SessionLocal() as db:
        existing = await db.scalar(select(ActivityType).limit(1))
        if existing:
            return
        for d in DEFAULT_ACTIVITY_TYPES:
            db.add(ActivityType(**d))
        await db.commit()
        logger.info("Seeded default activity types")


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await seed_defaults()
    os.makedirs(settings.upload_dir, exist_ok=True)
    yield


app = FastAPI(title="SmokeSignals API", lifespan=lifespan)

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(friends.router, prefix="/api")
app.include_router(circles.router, prefix="/api")
app.include_router(activity_types.router, prefix="/api")
app.include_router(activities.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(push.router, prefix="/api")
app.include_router(admin.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok", "env": settings.env}


@app.get("/api/config")
async def public_config():
    return {
        "cloudflare_access_enabled": settings.cloudflare_access_enabled,
        "vapid_public_key": settings.vapid_public_key,
    }


os.makedirs(settings.upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")
