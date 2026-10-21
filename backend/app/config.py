from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    espn_league_id: int
    espn_s2: str | None = None
    espn_swid: str | None = None
    service_token: str
    # Only needs to cover the few seconds between the commissioner's pairing preview and commit
    # (see routers/league.py) -- not a cadence-driven value. 900s predates the commissioner being
    # told team-name refreshes are "safe to run anytime"; at that length, a real ESPN-side name
    # change could silently not show up on the very next refresh click.
    cache_ttl_seconds: int = 60

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
