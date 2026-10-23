from fastapi import APIRouter, Depends, Request

from app.clients.espn import EspnClient
from app.routers.docs import V1_RESPONSES, Season
from app.schemas.api import LeagueBoxScoresResponse
from app.security import verify_service_token
from app.services.boxscore import get_league_box_scores

router = APIRouter(prefix="/v1", tags=["boxscore"], dependencies=[Depends(verify_service_token)])


@router.get(
    "/league/{season}/boxscores",
    response_model=LeagueBoxScoresResponse,
    summary="List live box scores",
    description=(
        "Per-player fantasy points for each side of each matchup that currently has lineup "
        "data (the in-progress week). Join to `/schedule` on `espn_matchup_id`.\n\n"
        "**Not cached** -- polled every ~10 minutes during live games."
    ),
    responses=V1_RESPONSES,
)
async def get_boxscores(season: Season, request: Request) -> LeagueBoxScoresResponse:
    espn: EspnClient = request.app.state.espn_client

    # No caching here, same reasoning as /schedule -- a cron hitting this every ~10 minutes
    # during live games needs the real current state each time.
    #
    # ESPN/validation errors aren't caught here -- app.error_handlers registers one handler per
    # exception type for the whole app, shared with /teams, /rosters, and /schedule.
    return await get_league_box_scores(espn, season)
