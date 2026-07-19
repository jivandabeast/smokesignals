import json
import logging
from typing import Any

from pywebpush import WebPushException, webpush
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .models import PushSubscription

logger = logging.getLogger(__name__)
settings = get_settings()


async def send_push_to_user(db: AsyncSession, user_id: int, title: str, body: str, data: dict[str, Any] | None = None):
    if not settings.vapid_private_key or not settings.vapid_public_key:
        return

    result = await db.execute(select(PushSubscription).where(PushSubscription.user_id == user_id))
    subs = result.scalars().all()

    payload = json.dumps({"title": title, "body": body, "data": data or {}})
    dead: list[PushSubscription] = []

    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": f"mailto:{settings.vapid_contact_email}"},
            )
        except WebPushException as e:
            logger.warning("web push failed: %s", e)
            if e.response is not None and e.response.status_code in (404, 410):
                dead.append(sub)
        except Exception as e:  # noqa: BLE001
            logger.exception("Unexpected web push error: %s", e)

    for s in dead:
        await db.delete(s)
    if dead:
        await db.commit()
