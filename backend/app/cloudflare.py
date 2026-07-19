"""Optional Cloudflare Zero Trust JWT verification with 24h certificate caching."""

import asyncio
import time
from typing import Any, Optional

import httpx
from jose import jwt

from .config import get_settings

settings = get_settings()

_CERTS_CACHE: dict[str, Any] = {"fetched_at": 0.0, "keys": None}
_LOCK = asyncio.Lock()


def _certs_url() -> str:
    domain = settings.cloudflare_team_domain
    if not domain:
        raise RuntimeError("SMOKESIGNALS_CLOUDFLARE_TEAM_DOMAIN not set")
    if domain.startswith("http://") or domain.startswith("https://"):
        base = domain.rstrip("/")
    else:
        base = f"https://{domain}"
    if ".cloudflareaccess.com" not in base:
        base = f"{base}.cloudflareaccess.com"
    return f"{base}/cdn-cgi/access/certs"


async def _fetch_certs() -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(_certs_url())
        r.raise_for_status()
        return r.json()


async def get_cached_certs(force: bool = False) -> dict:
    """Return the JWKS from Cloudflare, cached for `cloudflare_cert_cache_seconds` (24h default)."""
    now = time.time()
    if (
        not force
        and _CERTS_CACHE["keys"] is not None
        and now - _CERTS_CACHE["fetched_at"] < settings.cloudflare_cert_cache_seconds
    ):
        return _CERTS_CACHE["keys"]

    async with _LOCK:
        # Double-check inside the lock in case another coroutine already refreshed it.
        now = time.time()
        if (
            not force
            and _CERTS_CACHE["keys"] is not None
            and now - _CERTS_CACHE["fetched_at"] < settings.cloudflare_cert_cache_seconds
        ):
            return _CERTS_CACHE["keys"]
        keys = await _fetch_certs()
        _CERTS_CACHE["keys"] = keys
        _CERTS_CACHE["fetched_at"] = time.time()
        return keys


async def verify_cf_access_jwt(token: str) -> Optional[dict]:
    """Verify a Cloudflare Access JWT; returns claims or None."""
    if not settings.cloudflare_access_enabled:
        return None
    try:
        unverified = jwt.get_unverified_header(token)
        kid = unverified.get("kid")
        certs = await get_cached_certs()
        key = None
        for k in certs.get("keys", []):
            if k.get("kid") == kid:
                key = k
                break
        if key is None:
            certs = await get_cached_certs(force=True)
            for k in certs.get("keys", []):
                if k.get("kid") == kid:
                    key = k
                    break
        if key is None:
            return None

        audience = settings.cloudflare_audience
        claims = jwt.decode(
            token,
            key,
            algorithms=[key.get("alg", "RS256")],
            audience=audience if audience else None,
            options={"verify_aud": bool(audience)},
        )
        return claims
    except Exception:
        return None
