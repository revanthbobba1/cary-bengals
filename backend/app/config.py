from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    espn_league_id: int
    espn_s2: str | None = None
    espn_swid: str | None = None
    service_token: str
    cache_ttl_seconds: int = 900

    @model_validator(mode="after")
    def _check_cookie_pair(self) -> "Settings":
        if bool(self.espn_s2) != bool(self.espn_swid):
            raise ValueError(
                "ESPN_S2 and ESPN_SWID must be set together for a private league — "
                "only one was provided"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
