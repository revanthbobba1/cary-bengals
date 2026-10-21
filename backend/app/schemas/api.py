"""Our outward DTOs — the stable contract this service exposes. Never echo
raw ESPN JSON; these shapes are the only thing that leaves the service."""

from pydantic import BaseModel


class TeamRecordOut(BaseModel):
    wins: int
    losses: int
    ties: int


class TeamOut(BaseModel):
    espn_team_id: int
    name: str
    espn_owner_id: str | None
    owner_display_name: str | None
    record: TeamRecordOut


class LeagueTeamsResponse(BaseModel):
    season: int
    league_id: str
    fetched_at: str
    teams: list[TeamOut]
    warnings: list[str]


class RosterPlayerOut(BaseModel):
    name: str
    position: str
    pro_team: str
    lineup_slot: str
    is_starter: bool


class TeamRosterOut(BaseModel):
    espn_team_id: int
    players: list[RosterPlayerOut]


class LeagueRostersResponse(BaseModel):
    season: int
    league_id: str
    fetched_at: str
    teams: list[TeamRosterOut]
    warnings: list[str]


class MatchupOut(BaseModel):
    espn_matchup_id: int
    week: int
    is_playoffs: bool
    home_espn_team_id: int
    home_score: float
    away_espn_team_id: int
    away_score: float
    winner: str


class LeagueScheduleResponse(BaseModel):
    season: int
    league_id: str
    fetched_at: str
    current_week: int
    matchups: list[MatchupOut]
    warnings: list[str]
