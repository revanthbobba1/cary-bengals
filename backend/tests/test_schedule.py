import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.schemas.espn_raw import RawLeagueScheduleResponse
from app.services.schedule import get_league_schedule

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "mmatchupscore_2026.json"


class _StubEspnClient:
    """Stands in for EspnClient so get_league_schedule can be tested without any HTTP
    involved — respx-backed HTTP tests live in test_schedule_route.py."""

    def __init__(self, payload: dict) -> None:
        self._payload = payload

    async def fetch_league(self, season: int, views: list[str], x_fantasy_filter=None) -> dict:
        return self._payload


@pytest.fixture
def raw_payload() -> dict:
    return json.loads(FIXTURE_PATH.read_text())


def test_raw_model_ignores_unknown_fields() -> None:
    parsed = RawLeagueScheduleResponse.model_validate(
        {
            "id": 1,
            "seasonId": 2026,
            "status": {"currentMatchupPeriod": 7, "somethingEspnAddedLater": True},
            "schedule": [],
            "draftDetail": {"nested": True},
        }
    )
    assert parsed.id == 1
    assert parsed.status.currentMatchupPeriod == 7


def test_raw_model_requires_structural_fields() -> None:
    with pytest.raises(ValidationError):
        RawLeagueScheduleResponse.model_validate({"seasonId": 2026})


async def test_get_league_schedule_against_real_fixture(raw_payload: dict) -> None:
    result = await get_league_schedule(_StubEspnClient(raw_payload), season=2026)

    assert result.season == 2026
    assert result.current_week == 7
    assert len(result.matchups) == 84
    assert result.warnings == []

    first = result.matchups[0]
    assert first.espn_matchup_id == 1
    assert first.week == 1
    assert first.is_playoffs is False
    assert first.home_espn_team_id == 10
    assert first.home_score == 107.96
    assert first.away_espn_team_id == 2
    assert first.away_score == 121.68
    assert first.winner == "AWAY"

    last = result.matchups[-1]
    assert last.winner == "UNDECIDED"
    assert last.home_score == 0.0


async def test_get_league_schedule_marks_playoffs(raw_payload: dict) -> None:
    payload = json.loads(json.dumps(raw_payload))
    payload["schedule"][0]["playoffTierType"] = "WINNERS_BRACKET"

    result = await get_league_schedule(_StubEspnClient(payload), season=2026)

    assert result.matchups[0].is_playoffs is True
    assert all(m.is_playoffs is False for m in result.matchups[1:])
