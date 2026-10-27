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
    # Past week, already final -- ESPN sends no projection/win-probability for it.
    assert first.home_projected_score is None
    assert first.away_win_probability is None

    last = result.matchups[-1]
    assert last.winner == "UNDECIDED"
    assert last.home_score == 0.0


async def test_get_league_schedule_exposes_current_week_projections(raw_payload: dict) -> None:
    result = await get_league_schedule(_StubEspnClient(raw_payload), season=2026)

    # Index 36 in the fixture is the current (7th) matchup period, the one week ESPN actually
    # computes a live projection/win probability for.
    current = result.matchups[36]
    assert current.week == 7
    assert current.home_projected_score == pytest.approx(117.78564281)
    assert current.away_projected_score == pytest.approx(113.44203182)
    assert current.home_win_probability == pytest.approx(0.52)
    assert current.away_win_probability == pytest.approx(0.48)


async def test_get_league_schedule_marks_playoffs(raw_payload: dict) -> None:
    payload = json.loads(json.dumps(raw_payload))
    payload["schedule"][0]["playoffTierType"] = "WINNERS_BRACKET"

    result = await get_league_schedule(_StubEspnClient(payload), season=2026)

    assert result.matchups[0].is_playoffs is True
    assert all(m.is_playoffs is False for m in result.matchups[1:])


async def test_get_league_schedule_maps_bye_matchup(raw_payload: dict) -> None:
    # A playoff bye: ESPN sends the entry with `away` absent. It must still produce a row, with
    # the present team as home and the away fields null.
    payload = json.loads(json.dumps(raw_payload))
    original_count = len(payload["schedule"])
    home_team_id = payload["schedule"][0]["home"]["teamId"]
    del payload["schedule"][0]["away"]

    result = await get_league_schedule(_StubEspnClient(payload), season=2026)

    assert len(result.matchups) == original_count
    bye = result.matchups[0]
    assert bye.is_bye is True
    assert bye.home_espn_team_id == home_team_id
    assert bye.away_espn_team_id is None
    assert bye.away_score is None
    assert bye.away_projected_score is None
    assert bye.away_win_probability is None
    assert all(m.is_bye is False for m in result.matchups[1:])
    assert result.warnings == []


async def test_get_league_schedule_normalizes_bye_in_away_slot_to_home(raw_payload: dict) -> None:
    # Defensive: if ESPN ever populates only `away`, that team still becomes the home side.
    payload = json.loads(json.dumps(raw_payload))
    away_team_id = payload["schedule"][0]["away"]["teamId"]
    del payload["schedule"][0]["home"]

    result = await get_league_schedule(_StubEspnClient(payload), season=2026)

    bye = result.matchups[0]
    assert bye.is_bye is True
    assert bye.home_espn_team_id == away_team_id
    assert bye.away_espn_team_id is None


async def test_get_league_schedule_skips_matchup_with_no_teams(raw_payload: dict) -> None:
    payload = json.loads(json.dumps(raw_payload))
    original_count = len(payload["schedule"])
    del payload["schedule"][0]["home"]
    del payload["schedule"][0]["away"]

    result = await get_league_schedule(_StubEspnClient(payload), season=2026)

    assert len(result.matchups) == original_count - 1
    assert any("neither a home nor away team" in warning for warning in result.warnings)


async def test_get_league_schedule_prefers_live_total_when_present(raw_payload: dict) -> None:
    # ESPN leaves totalPoints at 0.0 during the week and reports the running score in
    # totalPointsLive; finished weeks carry no live field and keep totalPoints.
    live = next(m for m in raw_payload["schedule"] if m["matchupPeriodId"] == 7)
    live["home"]["totalPointsLive"] = 35.24

    result = await get_league_schedule(_StubEspnClient(raw_payload), season=2026)

    by_id = {m.espn_matchup_id: m for m in result.matchups}
    assert by_id[live["id"]].home_score == 35.24
    assert by_id[1].home_score == 107.96
