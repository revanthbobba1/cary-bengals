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
    cache = request.app.state.cache

    async def fetch() -> LeagueRostersResponse:
        return await get_league_rosters(espn, season)

    try:
        return await cache.get_or_set(("rosters", season), fetch)
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
