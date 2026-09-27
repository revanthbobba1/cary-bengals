from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import ValidationError

from app.clients.espn import EspnAuthError, EspnClient, EspnNotFoundError, EspnRequestError
from app.schemas.api import LeagueRostersResponse
from app.security import verify_service_token
from app.services.roster import get_league_rosters

router = APIRouter(prefix="/v1", tags=["roster"], dependencies=[Depends(verify_service_token)])


@router.get("/league/{season}/rosters", response_model=LeagueRostersResponse)
async def get_rosters(season: int, request: Request) -> LeagueRostersResponse:
    espn: EspnClient = request.app.state.espn_client

    # No caching here, unlike /teams -- that cache exists to avoid double-hitting ESPN within
    # one preview-then-commit UI flow, which rosters have no equivalent of (a single-click sync,
    # one fetch). Rosters are also explicitly meant to be re-run often (trades, waivers), so the
    # shared 15-minute TTL would otherwise let a commissioner's immediate re-sync silently persist
    # stale data while reporting success.
    try:
        return await get_league_rosters(espn, season)
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
