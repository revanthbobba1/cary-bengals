import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.schemas.espn_raw import RawLeagueRostersResponse
from app.services.roster import get_league_rosters

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "mroster_2026.json"


class _StubEspnClient:
    """Stands in for EspnClient so get_league_rosters can be tested without any HTTP
    involved — respx-backed HTTP tests live in test_roster_route.py."""

    def __init__(self, payload: dict) -> None:
        self._payload = payload

    async def fetch_league(self, season: int, views: list[str], x_fantasy_filter=None) -> dict:
        return self._payload


@pytest.fixture
def raw_payload() -> dict:
    return json.loads(FIXTURE_PATH.read_text())


def test_raw_model_ignores_unknown_fields() -> None:
    parsed = RawLeagueRostersResponse.model_validate(
        {
            "id": 1,
            "seasonId": 2026,
            "scoringPeriodId": 3,
            "teams": [],
            "somethingEspnAddedLater": {"nested": True},
        }
    )
    assert parsed.id == 1


def test_raw_model_requires_structural_fields() -> None:
    with pytest.raises(ValidationError):
        RawLeagueRostersResponse.model_validate({"seasonId": 2026})


async def test_get_league_rosters_against_real_fixture(raw_payload: dict) -> None:
    result = await get_league_rosters(_StubEspnClient(raw_payload), season=2026)

    assert result.season == 2026
    assert len(result.teams) == 2
    assert result.warnings == []

    first_team = result.teams[0]
    assert len(first_team.players) == 17

    # Position/slot ID mappings verified against real, identifiable players in the
    # captured fixture (see app/services/roster.py's module docstring).
    starters = [p for p in first_team.players if p.is_starter]
    bench = [p for p in first_team.players if not p.is_starter]
    assert starters
    assert bench
    assert all(p.position != "?" for p in first_team.players)
    assert all(p.lineup_slot != "?" for p in first_team.players)


async def test_get_league_rosters_skips_player_with_blank_name(raw_payload: dict) -> None:
    payload = json.loads(json.dumps(raw_payload))
    original_count = len(payload["teams"][0]["roster"]["entries"])
    payload["teams"][0]["roster"]["entries"][0]["playerPoolEntry"]["player"]["fullName"] = "   "

    result = await get_league_rosters(_StubEspnClient(payload), season=2026)

    assert len(result.teams[0].players) == original_count - 1
    assert any("no usable name" in warning for warning in result.warnings)
