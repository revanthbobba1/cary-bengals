import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.schemas.espn_raw import RawLeagueResponse
from app.services.league import _sanitize_name, get_league_teams

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "mteam_2026.json"


class _StubEspnClient:
    """Stands in for EspnClient so get_league_teams can be tested without
    any HTTP involved — respx-backed HTTP tests live in test_league_route.py."""

    def __init__(self, payload: dict) -> None:
        self._payload = payload

    async def fetch_league(self, season: int, views: list[str], x_fantasy_filter=None) -> dict:
        return self._payload


@pytest.fixture
def raw_payload() -> dict:
    return json.loads(FIXTURE_PATH.read_text())


def test_sanitize_name_strips_control_and_html_and_collapses_whitespace() -> None:
    assert _sanitize_name("  <b>Team\x07 Name</b>   here  ") == "Team Name here"


def test_sanitize_name_preserves_emoji_and_punctuation() -> None:
    assert _sanitize_name("Bark For Daddy!🫵🐶") == "Bark For Daddy!🫵🐶"
    assert _sanitize_name("Ladd's Lads") == "Ladd's Lads"


def test_sanitize_name_caps_length() -> None:
    assert len(_sanitize_name("x" * 500)) == 100


def test_sanitize_name_blank_or_none_returns_empty() -> None:
    assert _sanitize_name(None) == ""
    assert _sanitize_name("   ") == ""


def test_raw_model_ignores_unknown_fields() -> None:
    parsed = RawLeagueResponse.model_validate(
        {
            "id": 1,
            "seasonId": 2026,
            "members": [],
            "teams": [],
            "somethingEspnAddedLater": {"nested": True},
        }
    )
    assert parsed.id == 1


def test_raw_model_requires_structural_fields() -> None:
    with pytest.raises(ValidationError):
        RawLeagueResponse.model_validate({"seasonId": 2026})


async def test_get_league_teams_against_real_fixture(raw_payload: dict) -> None:
    result = await get_league_teams(_StubEspnClient(raw_payload), season=2026)

    assert result.season == 2026
    assert result.league_id == "19467081"
    assert len(result.teams) == 12
    assert result.warnings == []

    by_id = {team.espn_team_id: team for team in result.teams}
    bark_team = by_id[11]
    assert bark_team.name == "Bark For Daddy!🫵🐶"
    assert bark_team.espn_owner_id is not None
    assert bark_team.owner_display_name


async def test_get_league_teams_skips_team_with_blank_name(raw_payload: dict) -> None:
    payload = json.loads(json.dumps(raw_payload))
    payload["teams"][0]["name"] = "   "

    result = await get_league_teams(_StubEspnClient(payload), season=2026)

    assert len(result.teams) == 11
    assert any("no usable name" in warning for warning in result.warnings)
