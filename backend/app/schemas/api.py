"""Our outward DTOs — the stable contract this service exposes. Never echo
raw ESPN JSON; these shapes are the only thing that leaves the service.

Field descriptions/examples here feed the generated OpenAPI docs (/admin/api-docs on the site)."""

from typing import Literal

from pydantic import BaseModel, Field

_FETCHED_AT = Field(
    description="When this service fetched the data from ESPN (UTC, ISO 8601).",
    examples=["2026-10-23T14:05:12.345678+00:00"],
)
_SEASON = Field(description="NFL season year the data belongs to.", examples=[2026])
_LEAGUE_ID = Field(
    description="ESPN league ID this service is configured for.", examples=["123456"]
)
_WARNINGS = Field(
    description=(
        "Non-fatal problems, one string per skipped item (e.g. a player with no usable name). "
        "Empty when everything parsed cleanly."
    ),
    examples=[[]],
)
_POSITION = Field(
    description="Player's natural position.", examples=["QB", "RB", "WR", "TE", "K", "D/ST"]
)
_PRO_TEAM = Field(description="NFL team abbreviation.", examples=["CIN"])
_LINEUP_SLOT = Field(
    description=(
        "Lineup slot the player occupies this week: QB, RB, WR, TE, RB/WR, WR/TE, OP, FLEX, "
        "D/ST, K, Bench or IR."
    ),
    examples=["FLEX"],
)
_IS_STARTER = Field(description="True unless the slot is Bench or IR.")


class ErrorResponse(BaseModel):
    detail: str = Field(description="Human-readable reason for the failure.")


class TeamRecordOut(BaseModel):
    wins: int = Field(examples=[5])
    losses: int = Field(examples=[2])
    ties: int = Field(examples=[0])


class TeamOut(BaseModel):
    espn_team_id: int = Field(description="ESPN's numeric team ID, stable within a season.")
    name: str = Field(description="Team name, sanitized.", examples=["Cary Bengals"])
    espn_owner_id: str | None = Field(
        description="ESPN member ID of the team's primary owner, if any."
    )
    owner_display_name: str | None = Field(description="Primary owner's ESPN display name, if any.")
    record: TeamRecordOut = Field(description="Overall regular-season record.")


class LeagueTeamsResponse(BaseModel):
    season: int = _SEASON
    league_id: str = _LEAGUE_ID
    fetched_at: str = _FETCHED_AT
    teams: list[TeamOut]
    warnings: list[str] = _WARNINGS


class RosterPlayerOut(BaseModel):
    name: str = Field(examples=["Joe Burrow"])
    position: str = _POSITION
    pro_team: str = _PRO_TEAM
    lineup_slot: str = _LINEUP_SLOT
    is_starter: bool = _IS_STARTER


class TeamRosterOut(BaseModel):
    espn_team_id: int = Field(description="Matches TeamOut.espn_team_id from /teams.")
    players: list[RosterPlayerOut]


class LeagueRostersResponse(BaseModel):
    season: int = _SEASON
    league_id: str = _LEAGUE_ID
    fetched_at: str = _FETCHED_AT
    teams: list[TeamRosterOut]
    warnings: list[str] = _WARNINGS


class MatchupOut(BaseModel):
    espn_matchup_id: int = Field(description="ESPN's numeric matchup ID. Joins to box scores.")
    week: int = Field(description="Matchup period (week) number.", examples=[7])
    is_playoffs: bool = Field(description="True for any playoff tier, false for regular season.")
    is_bye: bool = Field(
        default=False,
        description=(
            "True when only one team is in this entry (a playoff bye). The present team is "
            "always reported as home; the away fields are null."
        ),
    )
    home_espn_team_id: int
    home_score: float = Field(
        description="Home team's points. Live running total during the current week.",
        examples=[104.52],
    )
    away_espn_team_id: int | None = Field(default=None, description="Null when is_bye.")
    away_score: float | None = Field(
        default=None,
        description="Away team's points; same semantics as home_score. Null when is_bye.",
    )
    winner: str = Field(
        description=(
            "HOME, AWAY, TIE or UNDECIDED (week not final). Passed through from ESPN, so an "
            "unexpected value is possible."
        ),
        examples=["UNDECIDED"],
    )
    # Current-matchup-period-only fields; null for past (final) and future (not yet computed)
    # weeks -- see RawMatchupTeam's comment in schemas/espn_raw.py.
    home_projected_score: float | None = Field(
        default=None, description="Projected final score. Null except for the current week."
    )
    away_projected_score: float | None = Field(
        default=None, description="Projected final score. Null except for the current week."
    )
    home_win_probability: float | None = Field(
        default=None,
        description="Home win probability, 0-1. Null except for the current week.",
    )
    away_win_probability: float | None = Field(
        default=None,
        description="Away win probability, 0-1. Null except for the current week.",
    )


class LeagueScheduleResponse(BaseModel):
    season: int = _SEASON
    league_id: str = _LEAGUE_ID
    fetched_at: str = _FETCHED_AT
    current_week: int = Field(description="The league's in-progress matchup period.", examples=[7])
    matchups: list[MatchupOut] = Field(description="Every matchup in the season, all weeks.")
    warnings: list[str] = _WARNINGS


class BoxScorePlayerOut(BaseModel):
    name: str = Field(examples=["Ja'Marr Chase"])
    position: str = _POSITION
    pro_team: str = _PRO_TEAM
    lineup_slot: str = _LINEUP_SLOT
    is_starter: bool = _IS_STARTER
    points: float = Field(description="Fantasy points scored this week.", examples=[21.4])
    stat_breakdown: dict[str, float] = Field(
        default_factory=dict,
        description=(
            "Non-zero counts for the stat categories worth showing, keyed by display label "
            "(e.g. 'Passing Yards'). Empty if the player has no such stats."
        ),
        examples=[{"Passing Yards": 275.0, "Passing TDs": 2.0}],
    )
    availability: Literal["bye", "ir", "out", "dnp", "pending"] | None = Field(
        default=None,
        description=(
            "Why the player has no stat line, or null if they played. bye: NFL team is on bye. "
            "ir: in an IR slot. out: ESPN injury status OUT. dnp: team played but the player "
            "didn't. pending: no stat line yet and not a bye (game hasn't started)."
        ),
    )


class MatchupBoxScoreOut(BaseModel):
    espn_matchup_id: int = Field(description="Matches MatchupOut.espn_matchup_id from /schedule.")
    team_side: str = Field(
        description="Which side of the matchup these players belong to.", examples=["home", "away"]
    )
    players: list[BoxScorePlayerOut]


class LeagueBoxScoresResponse(BaseModel):
    season: int = _SEASON
    league_id: str = _LEAGUE_ID
    fetched_at: str = _FETCHED_AT
    matchups: list[MatchupBoxScoreOut] = Field(
        description="Current-week matchups only; a side with no lineup data yet is omitted."
    )
    warnings: list[str] = _WARNINGS
