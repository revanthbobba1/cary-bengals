from fastapi import APIRouter, Depends, Request

from app.clients.espn import EspnClient
from app.schemas.api import LeagueBoxScoresResponse
from app.security import verify_service_token
from app.services.boxscore import get_league_box_scores

router = APIRouter(prefix="/v1", tags=["boxscore"], dependencies=[Depends(verify_service_token)])


@router.get("/league/{season}/boxscores", response_model=LeagueBoxScoresResponse)
async def get_boxscores(season: int, request: Request) -> LeagueBoxScoresResponse:
    espn: EspnClient = request.app.state.espn_client

    # No caching here, same reasoning as /schedule -- a cron hitting this every ~10 minutes
    # during live games needs the real current state each time.
    #
    # ESPN/validation errors aren't caught here -- app.error_handlers registers one handler per
    # exception type for the whole app, shared with /teams, /rosters, and /schedule.
    return await get_league_box_scores(espn, season)
