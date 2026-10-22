from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

from app.cache import TTLCache
from app.clients.espn import EspnClient
from app.config import get_settings
from app.error_handlers import register_espn_error_handlers
from app.routers import boxscore, health, league, roster, schedule


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    http_client = httpx.AsyncClient(timeout=10.0)

    app.state.espn_client = EspnClient(
        http_client=http_client,
        league_id=settings.espn_league_id,
        espn_s2=settings.espn_s2,
        espn_swid=settings.espn_swid,
    )
    app.state.cache = TTLCache(ttl_seconds=settings.cache_ttl_seconds)

    yield

    await http_client.aclose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Cary Bengals ESPN Service",
        version="0.1.0",
        lifespan=lifespan,
    )

    register_espn_error_handlers(app)

    app.include_router(health.router)
    app.include_router(league.router)
    app.include_router(roster.router)
    app.include_router(schedule.router)
    app.include_router(boxscore.router)

    return app


app = create_app()
