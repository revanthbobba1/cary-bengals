import json

import httpx

ESPN_BASE_URL = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl"
_FEED_PAGE_SIZE = 100
# A season has a few hundred transaction topics at most; the cap only guards a runaway loop.
_MAX_FEED_PAGES = 20


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
        scoring_period: int | None = None,
    ) -> dict:
        url = f"{ESPN_BASE_URL}/seasons/{season}/segments/0/leagues/{self._league_id}"
        params = [("view", view) for view in views]
        if scoring_period is not None:
            params.append(("scoringPeriodId", str(scoring_period)))
        headers = {"X-Fantasy-Filter": x_fantasy_filter} if x_fantasy_filter else {}
        return await self._get_league_json(url, params, headers)

    async def _get_league_json(
        self, url: str, params: list[tuple[str, str]], headers: dict[str, str]
    ) -> dict:
        response = await self._http.get(url, params=params, headers=headers)

        if response.status_code == 401:
            raise EspnAuthError("ESPN rejected the request — cookies missing or expired")
        if response.status_code == 404:
            raise EspnNotFoundError(f"ESPN league {self._league_id} not found")
        if response.is_error:
            raise EspnRequestError(f"ESPN returned {response.status_code}: {response.text[:200]}")

        return response.json()

    async def fetch_trade_activity(self, season: int) -> dict:
        """Executed-trade entries from the league's activity feed, every page merged into one
        `{"topics": [...]}`. The feed lives on its own `/communication/` path (not the league
        path `fetch_league` uses) and takes its filter in a different shape. Message types: 244
        is a player moving between teams in a processed trade, 245 a player dropped as part of
        one; the others in the feed are proposals and counter-offers."""
        url = (
            f"{ESPN_BASE_URL}/seasons/{season}/segments/0/leagues/{self._league_id}/communication/"
        )
        topics: list[dict] = []
        for page in range(_MAX_FEED_PAGES):
            flt = {
                "topics": {
                    "filterType": {"value": ["ACTIVITY_TRANSACTIONS"]},
                    "limit": _FEED_PAGE_SIZE,
                    "limitPerMessageSet": {"value": _FEED_PAGE_SIZE},
                    "offset": page * _FEED_PAGE_SIZE,
                    "sortMessageDate": {"sortPriority": 1, "sortAsc": False},
                    "sortFor": {"sortPriority": 2, "sortAsc": False},
                    "filterIncludeMessageTypeIds": {"value": [244, 245]},
                }
            }
            data = await self._get_league_json(
                url,
                [("view", "kona_league_communication")],
                {"X-Fantasy-Filter": json.dumps(flt)},
            )
            batch = data.get("topics", [])
            topics.extend(batch)
            if len(batch) < _FEED_PAGE_SIZE:
                break
        return {"topics": topics}

    async def fetch_pro_teams(self, season: int) -> dict:
        """NFL-wide pro team data (bye weeks, schedules). Not league-scoped, so it lives beside
        fetch_league rather than going through it."""
        response = await self._http.get(
            f"{ESPN_BASE_URL}/seasons/{season}", params=[("view", "proTeamSchedules_wl")]
        )

        if response.is_error:
            raise EspnRequestError(f"ESPN returned {response.status_code}: {response.text[:200]}")

        return response.json()
