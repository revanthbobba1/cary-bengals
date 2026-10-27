from fastapi import APIRouter, Depends, Request

from app.clients.espn import EspnClient
from app.routers.docs import V1_RESPONSES, Season
from app.schemas.api import LeagueScheduleResponse
from app.security import verify_service_token
from app.services.schedule import get_league_schedule

router = APIRouter(prefix="/v1", tags=["schedule"], dependencies=[Depends(verify_service_token)])


@router.get(
    "/league/{season}/schedule",
    response_model=LeagueScheduleResponse,
    summary="List season schedule and scores",
    description=(
        "Every matchup for every week with scores. For the in-progress week, scores are the "
        "live running total and projected score / win probability are populated; for other "
        "weeks those are null.\n\n"
        "A playoff bye (only one team in the entry) is returned with `is_bye` true; the present "
        "team is reported as home and the away fields are null.\n\n"
        "**Not cached** -- polled every ~10 minutes during live games."
    ),
    responses=V1_RESPONSES,
)
async def get_schedule(season: Season, request: Request) -> LeagueScheduleResponse:
    espn: EspnClient = request.app.state.espn_client

    # No caching here, same reasoning as /rosters, even stronger: a cron hitting this every
    # ~10 minutes during live games needs the real current state each time, not a
    # 15-minute-stale cached response.
    #
    # ESPN/validation errors aren't caught here -- app.error_handlers registers one handler per
    # exception type for the whole app, shared with /teams and /rosters, so raising it is enough.
    return await get_league_schedule(espn, season)
