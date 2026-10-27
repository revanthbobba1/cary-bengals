import json
from pathlib import Path

import pytest

from app.clients.espn import EspnRequestError
from app.espn_labels import label_stat_breakdown
from app.services.boxscore import get_league_box_scores

FIXTURES = Path(__file__).parent / "fixtures"
FIXTURE_PATH = FIXTURES / "mmatchupscore_2026.json"
# Captured mid-week-7 while games were in progress: real actual-stat lines (statSourceId 0),
# DNP players, and four NFL teams (BUF, LAC, WSH, JAX) on bye.
LIVE_FIXTURE_PATH = FIXTURES / "mmatchupscore_live_2026.json"
PRO_TEAMS_FIXTURE_PATH = FIXTURES / "proteams_2026.json"


class _StubEspnClient:
    """Stands in for EspnClient so get_league_box_scores can be tested without any HTTP
    involved — respx-backed HTTP tests live in test_boxscore_route.py."""

    def __init__(self, payload: dict, pro_teams_error: Exception | None = None) -> None:
        self._payload = payload
        self._pro_teams_error = pro_teams_error

    async def fetch_league(self, season: int, views: list[str], x_fantasy_filter=None) -> dict:
        return self._payload

    async def fetch_pro_teams(self, season: int) -> dict:
        if self._pro_teams_error:
            raise self._pro_teams_error
        return json.loads(PRO_TEAMS_FIXTURE_PATH.read_text())


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


@pytest.fixture
def live_payload() -> dict:
    return json.loads(LIVE_FIXTURE_PATH.read_text())


def _player(result, name: str):
    return next(p for m in result.matchups for p in m.players if p.name == name)


def test_label_stat_breakdown_keeps_only_known_nonzero_categories() -> None:
    stats = {"3": 321.0, "4": 2.0, "20": 0.0, "24": 26.0, "23": 4.0, "999": 5.0}

    assert label_stat_breakdown(stats) == {
        "Passing Yards": 321.0,
        "Passing TDs": 2.0,
        "Rushing Yards": 26.0,
    }
    assert label_stat_breakdown({}) == {}


async def test_live_fixture_stat_breakdown_matches_real_stat_lines(live_payload: dict) -> None:
    result = await get_league_box_scores(_StubEspnClient(live_payload), season=2026)

    maye = _player(result, "Drake Maye")
    assert maye.points == 27.44
    assert maye.availability is None
    assert maye.stat_breakdown == {
        "Passing Yards": 321.0,
        "Passing TDs": 2.0,
        "INT": 1.0,
        "Rushing Yards": 26.0,
        "Rushing TDs": 1.0,
    }

    # Not position-restricted: a back's receiving stats appear alongside his rushing stats.
    mccaffrey = _player(result, "Christian McCaffrey")
    assert mccaffrey.stat_breakdown == {
        "Rushing Yards": 39.0,
        "Rushing TDs": 1.0,
        "Receiving Yards": 61.0,
        "Receptions": 6.0,
    }


async def test_live_fixture_availability_states(live_payload: dict) -> None:
    result = await get_league_box_scores(_StubEspnClient(live_payload), season=2026)
    players = [p for m in result.matchups for p in m.players]

    # Team on bye (BUF, WSH): no actual-stat line at all, and byeWeek == this scoring period.
    assert _player(result, "Josh Allen").availability == "bye"
    # A bye wins over the injury status that would otherwise apply (WSH, OUT, in an IR slot).
    assert _player(result, "Terry McLaurin").availability == "bye"
    assert sum(p.availability == "bye" for p in players) == 27
    # Team played, player didn't: OUT (bench slot), IR slot, and a healthy scratch.
    assert _player(result, "DeVonta Smith").availability == "out"
    assert _player(result, "Davante Adams").availability == "ir"
    assert _player(result, "Jake Ferguson").availability == "dnp"
    # A free agent has no NFL team, so there is no bye to explain the missing line.
    assert _player(result, "Tyreek Hill").availability == "ir"
    # Anyone with a real stat line has no availability and a breakdown.
    assert all(p.availability is None for p in players if p.stat_breakdown)
    assert result.warnings == []


async def test_pre_game_payload_without_actual_lines_is_pending_not_bye(
    raw_payload: dict,
) -> None:
    result = await get_league_box_scores(_StubEspnClient(raw_payload), season=2026)

    mccaffrey = _player(result, "Christian McCaffrey")  # SF, not on bye in week 7
    assert mccaffrey.availability == "pending"
    assert mccaffrey.stat_breakdown == {}


async def test_bye_lookup_failure_degrades_to_pending_with_warning(live_payload: dict) -> None:
    client = _StubEspnClient(live_payload, pro_teams_error=EspnRequestError("ESPN returned 500"))

    result = await get_league_box_scores(client, season=2026)

    assert _player(result, "Josh Allen").availability == "pending"
    assert any("bye weeks" in warning for warning in result.warnings)
    # The rest of the box score is unaffected.
    assert _player(result, "Drake Maye").points == 27.44
