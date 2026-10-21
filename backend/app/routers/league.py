from fastapi import APIRouter, Depends, Request

from app.clients.espn import EspnClient
from app.schemas.api import LeagueTeamsResponse
from app.security import verify_service_token
from app.services.league import get_league_teams

router = APIRouter(prefix="/v1", tags=["league"], dependencies=[Depends(verify_service_token)])


@router.get("/league/{season}/teams", response_model=LeagueTeamsResponse)
async def get_teams(season: int, request: Request) -> LeagueTeamsResponse:
    espn: EspnClient = request.app.state.espn_client
    cache = request.app.state.cache

    async def fetch() -> LeagueTeamsResponse:
        return await get_league_teams(espn, season)

    # ESPN/validation errors aren't caught here -- see app.error_handlers.
    return await cache.get_or_set(("teams", season), fetch)
