from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import ValidationError

from app.clients.espn import EspnAuthError, EspnClient, EspnNotFoundError, EspnRequestError
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

    try:
        return await cache.get_or_set(("teams", season), fetch)
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
