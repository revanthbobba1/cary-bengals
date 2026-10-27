from fastapi import APIRouter, Depends, Request

from app.clients.espn import EspnClient
from app.routers.docs import V1_RESPONSES, Season
from app.schemas.api import LeagueRostersResponse
from app.security import verify_service_token
from app.services.roster import get_league_rosters

router = APIRouter(prefix="/v1", tags=["roster"], dependencies=[Depends(verify_service_token)])


@router.get(
    "/league/{season}/rosters",
    response_model=LeagueRostersResponse,
    summary="List team rosters",
    description=(
        "Every team's full roster, including bench and IR players, with lineup slot for each.\n\n"
        "**Not cached** -- rosters change with trades and waivers, so each call hits ESPN."
    ),
    responses=V1_RESPONSES,
)
async def get_rosters(season: Season, request: Request) -> LeagueRostersResponse:
    espn: EspnClient = request.app.state.espn_client

    # No caching here, unlike /teams -- that cache exists to avoid double-hitting ESPN within
    # one preview-then-commit UI flow, which rosters have no equivalent of (a single-click sync,
    # one fetch). Rosters are also explicitly meant to be re-run often (trades, waivers), so the
    # shared 15-minute TTL would otherwise let a commissioner's immediate re-sync silently persist
    # stale data while reporting success.
    #
    # ESPN/validation errors aren't caught here -- see app.error_handlers.
    return await get_league_rosters(espn, season)
