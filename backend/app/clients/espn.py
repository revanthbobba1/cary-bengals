import httpx

ESPN_BASE_URL = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl"


class EspnAuthError(Exception):
    """ESPN rejected the request as unauthorized — cookies missing or expired."""


class EspnNotFoundError(Exception):
    """ESPN returned 404 — the league ID is likely wrong."""


class EspnRequestError(Exception):
    """Unexpected non-2xx response from ESPN."""


class EspnClient:
    """Thin async wrapper around ESPN's undocumented fantasy API. Exposes one
    primitive so new views (rosters, scores, standings, ...) are just a
    different `views` list, not new client code."""

    def __init__(
        self,
        http_client: httpx.AsyncClient,
        league_id: int,
        espn_s2: str | None = None,
        espn_swid: str | None = None,
    ) -> None:
        self._http = http_client
        self._league_id = league_id
        if espn_s2 and espn_swid:
            # Set on the client itself, not per-request — httpx deprecated
            # per-request cookies, and this client is dedicated to ESPN calls.
            self._http.cookies.update({"espn_s2": espn_s2, "SWID": espn_swid})

    async def fetch_league(
        self,
        season: int,
        views: list[str],
        x_fantasy_filter: str | None = None,
    ) -> dict:
        url = f"{ESPN_BASE_URL}/seasons/{season}/segments/0/leagues/{self._league_id}"
        params = [("view", view) for view in views]
        headers = {"X-Fantasy-Filter": x_fantasy_filter} if x_fantasy_filter else {}

        response = await self._http.get(url, params=params, headers=headers)

        if response.status_code == 401:
            raise EspnAuthError("ESPN rejected the request — cookies missing or expired")
        if response.status_code == 404:
            raise EspnNotFoundError(f"ESPN league {self._league_id} not found")
        if response.is_error:
            raise EspnRequestError(f"ESPN returned {response.status_code}: {response.text[:200]}")

        return response.json()
