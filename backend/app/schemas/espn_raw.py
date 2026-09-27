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
