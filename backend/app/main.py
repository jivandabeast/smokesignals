import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, text

from .config import get_settings
from .database import Base, SessionLocal, engine
from .models import ActivityType, ActivityTypeGroup
from .routers import (
    activities,
    activity_types,
    admin,
    auth,
    circles,
    friends,
    notifications,
    push,
    reactions,
    users,
)

logger = logging.getLogger("smokesignals")
logging.basicConfig(level=logging.INFO)

settings = get_settings()


DEFAULT_GROUPS = [
    {"slug": "drinks", "name": "Drinks", "emoji": "🍻", "color": "#f2b134", "sort_order": 10},
    {"slug": "smoke", "name": "Smoke break", "emoji": "💨", "color": "#767676", "sort_order": 20},
    {"slug": "caffeine", "name": "Caffeine", "emoji": "☕", "color": "#6f4e37", "sort_order": 30},
]

DEFAULT_ACTIVITY_TYPES = [
    {"slug": "beer", "label": "Having a beer", "emoji": "🍺", "color": "#f2b134", "sort_order": 10, "group_slug": "drinks"},
    {"slug": "wine", "label": "Having wine", "emoji": "🍷", "color": "#7a1e3a", "sort_order": 20, "group_slug": "drinks"},
    {"slug": "cocktail", "label": "Cocktail hour", "emoji": "🍸", "color": "#e94f75", "sort_order": 30, "group_slug": "drinks"},
    {"slug": "coffee", "label": "Coffee break", "emoji": "☕", "color": "#6f4e37", "sort_order": 40, "group_slug": "caffeine"},
    {"slug": "smoke", "label": "Having a smoke", "emoji": "🚬", "color": "#767676", "sort_order": 50, "group_slug": "smoke"},
    {"slug": "vape", "label": "Vaping", "emoji": "💨", "color": "#4aa3df", "sort_order": 60, "group_slug": "smoke"},
]


async def _lightweight_migrate():
    """Add columns introduced after initial schema. Idempotent; safe on fresh DBs.

    Full Alembic migrations are still preferred for production, but this keeps
    existing dev/prod installs alive when we bolt on columns.
    """
    stmts = [
        "ALTER TABLE activities ADD COLUMN IF NOT EXISTS duration_minutes INTEGER",
        "ALTER TABLE activities ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false",
        "ALTER TABLE activity_types ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES activity_type_groups(id) ON DELETE SET NULL",
        "ALTER TABLE activity_types ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE",
        "CREATE INDEX IF NOT EXISTS ix_activity_types_group_id ON activity_types(group_id)",
        "CREATE INDEX IF NOT EXISTS ix_activity_types_owner_id ON activity_types(owner_id)",
        # Normalise avatar paths: legacy rows may have '/api/uploads/...'. The
        # prod frontend now serves uploads from the ungated '/uploads/*' path,
        # so rewrite them once at startup. Safe on fresh DBs (no-op).
        "UPDATE users SET profile_picture = REPLACE(profile_picture, '/api/uploads/', '/uploads/') WHERE profile_picture LIKE '/api/uploads/%'",
    ]
    async with engine.begin() as conn:
        for s in stmts:
            try:
                await conn.execute(text(s))
            except Exception as e:  # noqa: BLE001
                logger.warning("migrate: %s -> %s", s, e)


async def seed_defaults():
    async with SessionLocal() as db:
        # Seed groups (find-or-create by name for admin-owned globals).
        existing_groups = {
            g.name: g for g in (await db.execute(select(ActivityTypeGroup).where(ActivityTypeGroup.owner_id.is_(None)))).scalars().all()
        }
        for gd in DEFAULT_GROUPS:
            if gd["name"] not in existing_groups:
                g = ActivityTypeGroup(
                    name=gd["name"], emoji=gd["emoji"], color=gd["color"], sort_order=gd["sort_order"]
                )
                db.add(g)
                existing_groups[gd["name"]] = g
        await db.flush()

        slug_to_group = {
            "drinks": existing_groups.get("Drinks"),
            "smoke": existing_groups.get("Smoke break"),
            "caffeine": existing_groups.get("Caffeine"),
        }

        # Seed types (find-or-create by slug, but only backfill group_id if unset).
        existing_types = {
            t.slug: t for t in (await db.execute(select(ActivityType))).scalars().all()
        }
        for d in DEFAULT_ACTIVITY_TYPES:
            group = slug_to_group.get(d["group_slug"])
            group_id = group.id if group else None
            t = existing_types.get(d["slug"])
            if not t:
                db.add(
                    ActivityType(
                        slug=d["slug"],
                        label=d["label"],
                        emoji=d["emoji"],
                        color=d["color"],
                        sort_order=d["sort_order"],
                        group_id=group_id,
                    )
                )
            elif t.group_id is None and group_id is not None:
                t.group_id = group_id
        await db.commit()
        logger.info("Seeded default activity types and groups")


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _lightweight_migrate()
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
app.include_router(reactions.router, prefix="/api")
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
# Mount at both /uploads (legacy path) and /api/uploads (portable — always reached
# through the same reverse proxy rule that handles /api/*). Stored profile_picture
# values written by the API use the /api/uploads prefix.
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads-legacy")
app.mount("/api/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")
