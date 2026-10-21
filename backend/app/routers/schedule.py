from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import ValidationError

from app.clients.espn import EspnAuthError, EspnClient, EspnNotFoundError, EspnRequestError
from app.schemas.api import LeagueScheduleResponse
from app.security import verify_service_token
from app.services.schedule import get_league_schedule

router = APIRouter(prefix="/v1", tags=["schedule"], dependencies=[Depends(verify_service_token)])


@router.get("/league/{season}/schedule", response_model=LeagueScheduleResponse)
async def get_schedule(season: int, request: Request) -> LeagueScheduleResponse:
    espn: EspnClient = request.app.state.espn_client

    # No caching here, same reasoning as /rosters, even stronger: a cron hitting this every
    # ~10 minutes during live games needs the real current state each time, not a
    # 15-minute-stale cached response.
    try:
        return await get_league_schedule(espn, season)
    except EspnAuthError as exc:
        raise HTTPException(
            status_code=502, detail="ESPN credentials expired — re-capture cookies"
        ) from exc
    except EspnNotFoundError as exc:
        raise HTTPException(
            status_code=502, detail="ESPN league not found — check the league ID"
        ) from exc
    except EspnRequestError as exc:
        raise HTTPException(status_code=502, detail=f"ESPN request failed: {exc}") from exc
    except ValidationError as exc:
        raise HTTPException(
            status_code=502, detail=f"Unexpected ESPN response shape: {exc}"
        ) from exc
