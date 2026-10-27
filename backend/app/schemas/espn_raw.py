"""Pydantic models mirroring ESPN's raw `mTeam` payload shape.

This is the sanitization boundary (see docs/ESPN_INTEGRATION_PLAN.md §2.1):
`extra="ignore"` means ESPN adding or reshaping unrelated fields shows up as
nothing at all here, and a genuinely missing required field raises a clean
ValidationError rather than a silent bad write.
"""

from pydantic import BaseModel, ConfigDict


class RawMember(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    displayName: str | None = None
    firstName: str | None = None
    lastName: str | None = None


class RawRecordStats(BaseModel):
    model_config = ConfigDict(extra="ignore")

    wins: int = 0
    losses: int = 0
    ties: int = 0
    pointsFor: float = 0.0
    pointsAgainst: float = 0.0


class RawRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")

    overall: RawRecordStats


class RawTeam(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int
    abbrev: str | None = None
    name: str | None = None
    owners: list[str] = []
    primaryOwner: str | None = None
    record: RawRecord


class RawLeagueResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int
    seasonId: int
    members: list[RawMember] = []
    teams: list[RawTeam] = []


# --- mRoster view --------------------------------------------------------------------
# A separate response shape, not a superset of RawLeagueResponse above: with only
# ?view=mRoster requested, ESPN's team objects carry just `id` + `roster`, none of the
# name/owner/record fields RawTeam declares.


class RawRosterPlayer(BaseModel):
    model_config = ConfigDict(extra="ignore")

    fullName: str
    defaultPositionId: int
    proTeamId: int


class RawPlayerPoolEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")

    player: RawRosterPlayer


class RawRosterEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")

    lineupSlotId: int
    playerPoolEntry: RawPlayerPoolEntry


class RawRoster(BaseModel):
    model_config = ConfigDict(extra="ignore")

    entries: list[RawRosterEntry] = []


class RawRosterTeam(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int
    roster: RawRoster


class RawLeagueRostersResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int
    seasonId: int
    teams: list[RawRosterTeam] = []


# --- mMatchupScore view --------------------------------------------------------------
# A third, separate response shape -- ?view=mMatchupScore alone carries no `members`/owner
# fields at all (confirmed against a real captured payload), unlike mTeam. No sanitize_name
# pass is needed anywhere in this view for that reason.


class RawMatchupTeam(BaseModel):
    model_config = ConfigDict(extra="ignore")

    teamId: int
    totalPoints: float = 0.0
    # The in-progress week's running score. `totalPoints` stays 0.0 for the whole week (confirmed
    # against a live probe: every matchup read 0.0 while players had scored), and only settles
    # once the week is final. Absent for finished/future weeks.
    totalPointsLive: float | None = None
    # Both null outside the current matchup period -- ESPN only computes a live projection/win
    # probability for the week that's actually in progress, not past (already final) or future
    # (not yet reached) weeks. Confirmed against a real captured payload, not assumed.
    totalProjectedPoints: float | None = None
    winProbability: float | None = None


class RawMatchup(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int
    matchupPeriodId: int
    # "NONE" on every entry seen so far. Not hard-enumerated -- ESPN's other known values
    # (winners/losers/consolation brackets) are handled generically as "is a playoff tier",
    # not matched by name.
    playoffTierType: str
    # HOME/AWAY/UNDECIDED confirmed live; TIE is documented ESPN behavior but not seen this
    # season. Kept as a plain string (not an enum) so an unanticipated value round-trips
    # instead of raising.
    winner: str
    # Optional, not required: a playoff bye has ESPN omit one side entirely rather than send a
    # placeholder (confirmed against this league's 2025 week 15). See services/schedule.py for
    # the is_bye handling -- the committed fixture is a regular-season week, so tests simulate a
    # bye by deleting a side.
    home: RawMatchupTeam | None = None
    away: RawMatchupTeam | None = None


class RawLeagueStatus(BaseModel):
    model_config = ConfigDict(extra="ignore")

    currentMatchupPeriod: int


class RawLeagueScheduleResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int
    seasonId: int
    status: RawLeagueStatus
    schedule: list[RawMatchup] = []


# --- mMatchupScore + mLiveScoring view (box scores) -----------------------------------
# A fourth, separate response shape, same reasoning as mRoster's own separation above: with only
# ?view=mMatchupScore requested (services/schedule.py's own fetch), ESPN's
# rosterForCurrentScoringPeriod player objects carry only `stats` -- no id/name/position at all
# (confirmed against both a real captured payload and a live probe). Adding `view=mLiveScoring`
# alongside it (services/boxscore.py's own fetch) is what actually populates player identity.
# These models are intentionally NOT shared with RawMatchupTeam/RawMatchup/
# RawLeagueScheduleResponse above -- bolting rosterForCurrentScoringPeriod onto those forced
# schedule.py's narrower fetch to satisfy this view's stricter shape and crashed matchup sync in
# production (see docs/ESPN_INTEGRATION_PLAN.md's hotfix note).


class RawBoxScoreStat(BaseModel):
    model_config = ConfigDict(extra="ignore")

    statSourceId: int
    scoringPeriodId: int
    appliedTotal: float = 0.0


class RawBoxScorePlayer(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int
    fullName: str
    defaultPositionId: int
    proTeamId: int
    stats: list[RawBoxScoreStat] = []


class RawBoxScorePlayerPoolEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")

    player: RawBoxScorePlayer


class RawBoxScoreEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")

    lineupSlotId: int
    playerPoolEntry: RawBoxScorePlayerPoolEntry


class RawRosterForCurrentScoringPeriod(BaseModel):
    model_config = ConfigDict(extra="ignore")

    entries: list[RawBoxScoreEntry] = []


class RawBoxScoreMatchupTeam(BaseModel):
    model_config = ConfigDict(extra="ignore")

    # Null both before a week has started and once mLiveScoring stops being requested for it --
    # same current-matchup-period-only nullability as RawMatchupTeam's projection fields.
    rosterForCurrentScoringPeriod: RawRosterForCurrentScoringPeriod | None = None


class RawBoxScoreMatchup(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int
    matchupPeriodId: int
    home: RawBoxScoreMatchupTeam | None = None
    away: RawBoxScoreMatchupTeam | None = None


class RawLeagueBoxScoresResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int
    seasonId: int
    schedule: list[RawBoxScoreMatchup] = []
