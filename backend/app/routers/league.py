from fastapi import APIRouter, Depends, Request

from app.clients.espn import EspnClient
from app.routers.docs import V1_RESPONSES, Season
from app.schemas.api import LeagueTeamsResponse
from app.security import verify_service_token
from app.services.league import get_league_teams

router = APIRouter(prefix="/v1", tags=["league"], dependencies=[Depends(verify_service_token)])


@router.get(
    "/league/{season}/teams",
    response_model=LeagueTeamsResponse,
    summary="List league teams",
    description=(
        "Every team in the league with its owner and overall record.\n\n"
        "**Cached** in-process for `CACHE_TTL_SECONDS` (default 60s), so a preview followed "
        "by a commit reads ESPN once."
    ),
    responses=V1_RESPONSES,
)
async def get_teams(season: Season, request: Request) -> LeagueTeamsResponse:
    espn: EspnClient = request.app.state.espn_client
    cache = request.app.state.cache

    async def fetch() -> LeagueTeamsResponse:
        return await get_league_teams(espn, season)

    # ESPN/validation errors aren't caught here -- see app.error_handlers.
    return await cache.get_or_set(("teams", season), fetch)
