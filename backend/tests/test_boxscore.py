import json
from pathlib import Path

import pytest

from app.services.boxscore import get_league_box_scores

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "mmatchupscore_2026.json"


class _StubEspnClient:
    """Stands in for EspnClient so get_league_box_scores can be tested without any HTTP
    involved — respx-backed HTTP tests live in test_boxscore_route.py."""

    def __init__(self, payload: dict) -> None:
        self._payload = payload

    async def fetch_league(self, season: int, views: list[str], x_fantasy_filter=None) -> dict:
        return self._payload


@pytest.fixture
def raw_payload() -> dict:
    return json.loads(FIXTURE_PATH.read_text())


async def test_get_league_box_scores_against_real_fixture(raw_payload: dict) -> None:
    result = await get_league_box_scores(_StubEspnClient(raw_payload), season=2026)

    assert result.season == 2026
    # Only the current matchup period (6 matchups, 2 sides each) has box-score data -- every
    # other week's matchups have no `rosterForCurrentScoringPeriod` at all.
    assert len(result.matchups) == 12
    assert sum(len(m.players) for m in result.matchups) == 203
    assert result.warnings == []

    matchup_37_home = next(
        m for m in result.matchups if m.espn_matchup_id == 37 and m.team_side == "home"
    )
    assert len(matchup_37_home.players) == 16

    mccaffrey = matchup_37_home.players[0]
    assert mccaffrey.name == "Christian McCaffrey"
    assert mccaffrey.position == "RB"
    assert mccaffrey.pro_team == "SF"
    assert mccaffrey.lineup_slot == "RB"
    assert mccaffrey.is_starter is True
    # Pre-game: only a statSourceId=1 (projected) stat line exists, same as the team's own
    # totalPoints being 0 -- no statSourceId=0 (actual) entry yet, so points stay 0 rather than
    # showing a projection the team score doesn't reflect.
    assert mccaffrey.points == 0.0


async def test_get_league_box_scores_ignores_non_current_weeks(raw_payload: dict) -> None:
    result = await get_league_box_scores(_StubEspnClient(raw_payload), season=2026)

    assert all(m.espn_matchup_id in range(37, 43) for m in result.matchups)


async def test_get_league_box_scores_selects_actual_over_projected_points(
    raw_payload: dict,
) -> None:
    payload = json.loads(json.dumps(raw_payload))
    matchup_37 = next(m for m in payload["schedule"] if m["id"] == 37)
    entry = matchup_37["home"]["rosterForCurrentScoringPeriod"]["entries"][0]
    # Simulate a live game: both a projected (1) and an actual (0) stat line present, same as a
    # real in-progress payload would carry.
    entry["playerPoolEntry"]["player"]["stats"].append(
        {"statSourceId": 0, "scoringPeriodId": 7, "appliedTotal": 24.5}
    )

    result = await get_league_box_scores(_StubEspnClient(payload), season=2026)

    matchup_37_home = next(
        m for m in result.matchups if m.espn_matchup_id == 37 and m.team_side == "home"
    )
    assert matchup_37_home.players[0].points == 24.5


async def test_get_league_box_scores_skips_unnamed_player(raw_payload: dict) -> None:
    payload = json.loads(json.dumps(raw_payload))
    matchup_37 = next(m for m in payload["schedule"] if m["id"] == 37)
    entries = matchup_37["home"]["rosterForCurrentScoringPeriod"]["entries"]
    original_count = len(entries)
    entries[0]["playerPoolEntry"]["player"]["fullName"] = ""

    result = await get_league_box_scores(_StubEspnClient(payload), season=2026)

    matchup_37_home = next(
        m for m in result.matchups if m.espn_matchup_id == 37 and m.team_side == "home"
    )
    assert len(matchup_37_home.players) == original_count - 1
    assert any("no usable name" in warning for warning in result.warnings)


async def test_get_league_box_scores_labels_one_sided_matchup_as_home(raw_payload: dict) -> None:
    # A bye populated only in `away` must still be reported as "home", matching schedule.py's
    # normalization -- otherwise its box score would attach to the wrong side of the matchups row.
    payload = json.loads(json.dumps(raw_payload))
    current = next(m for m in payload["schedule"] if m["matchupPeriodId"] == 7)
    assert current["away"].get("rosterForCurrentScoringPeriod") is not None
    del current["home"]

    result = await get_league_box_scores(_StubEspnClient(payload), season=2026)

    sides = [b.team_side for b in result.matchups if b.espn_matchup_id == current["id"]]
    assert sides == ["home"]
