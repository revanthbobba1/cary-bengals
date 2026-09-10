from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    espn_league_id: int
    espn_s2: str | None = None
    espn_swid: str | None = None
    service_token: str
    cache_ttl_seconds: int = 900


@lru_cache
def get_settings() -> Settings:
    return Settings()
