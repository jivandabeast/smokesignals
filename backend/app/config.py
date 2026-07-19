from functools import lru_cache
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="SMOKESIGNALS_", extra="ignore")

    env: str = "development"
    secret_key: str = "change-me-in-production"
    access_token_expires_minutes: int = 60 * 24 * 14

    database_url: str = "postgresql+asyncpg://smokesignals:smokesignals@db:5432/smokesignals"

    cors_origins: str = "*"

    cloudflare_access_enabled: bool = False
    cloudflare_team_domain: Optional[str] = None
    cloudflare_audience: Optional[str] = None
    cloudflare_cert_cache_seconds: int = 60 * 60 * 24

    vapid_public_key: Optional[str] = None
    vapid_private_key: Optional[str] = None
    vapid_contact_email: str = "admin@smokesignals.local"

    upload_dir: str = "/data/uploads"
    max_upload_bytes: int = 5 * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
