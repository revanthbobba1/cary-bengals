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
    # Optional, not required: an odd team count (a future season's bye week) has ESPN omit one
    # side entirely rather than send a placeholder. See services/schedule.py for the skip+warn
    # handling -- the current fixture (12 teams, no byes) never exercises this path.
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
