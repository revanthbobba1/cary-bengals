from fastapi import APIRouter, Depends, Request

from app.clients.espn import EspnClient
from app.routers.docs import V1_RESPONSES, Season
from app.schemas.api import LeagueTransactionsResponse
from app.security import verify_service_token
from app.services.transactions import get_league_transactions

router = APIRouter(
    prefix="/v1", tags=["transactions"], dependencies=[Depends(verify_service_token)]
)


@router.get(
    "/league/{season}/transactions",
    response_model=LeagueTransactionsResponse,
    summary="List waiver claims, pickups and trades",
    description=(
        "Every processed waiver claim (executed or failed, from all teams, with FAAB bid "
        "amounts), free-agent pickup and accepted trade this season, newest first. Lineup moves "
        "are excluded, as are claims still pending -- those are bids that haven't run yet. "
        "Player names are resolved with a second ESPN call.\n\n"
        "**Not cached** -- the sync wants the real current state each time."
    ),
    responses=V1_RESPONSES,
)
async def get_transactions(season: Season, request: Request) -> LeagueTransactionsResponse:
    espn: EspnClient = request.app.state.espn_client

    # Uncached, same reasoning as /rosters and /schedule. ESPN/validation errors aren't caught
    # here -- see app.error_handlers.
    return await get_league_transactions(espn, season)
