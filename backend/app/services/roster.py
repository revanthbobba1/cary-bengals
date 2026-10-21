"""Fetch and sanitize ESPN roster (`mRoster`) data.

Position/lineup-slot/pro-team IDs are ESPN's own undocumented numeric codes — the payload never
carries a human-readable label for any of them. The mappings below are the standard values the
fantasy-football community has reverse-engineered (see docs/ESPN_INTEGRATION_PLAN.md §7), and were
cross-checked against a real captured league payload: every position/slot code here matched a
real, identifiable player at that code (e.g. position 2 = RB confirmed via Christian McCaffrey,
Saquon Barkley, etc.; slot 20 = Bench confirmed via known backups sitting there). Pro-team
abbreviations are the standard ESPN table and are purely cosmetic display text — an occasional
mismatch for a very recently traded/signed player has no effect on starter/bench correctness,
which depends only on lineup_slot.
"""

from datetime import UTC, datetime

from app.clients.espn import EspnClient
from app.sanitize import sanitize_name
from app.schemas.api import LeagueRostersResponse, RosterPlayerOut, TeamRosterOut
from app.schemas.espn_raw import RawLeagueRostersResponse

_POSITIONS = {1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST"}

_LINEUP_SLOTS = {
    0: "QB",
    2: "RB",
    3: "RB/WR",
    4: "WR",
    5: "WR/TE",
    6: "TE",
    7: "OP",
    16: "D/ST",
    17: "K",
    20: "Bench",
    21: "IR",
    23: "FLEX",
}
_BENCH_SLOTS = {20, 21}

_PRO_TEAMS = {
    1: "ATL",
    2: "BUF",
    3: "CHI",
    4: "CIN",
    5: "CLE",
    6: "DAL",
    7: "DEN",
    8: "DET",
    9: "GB",
    10: "TEN",
    11: "IND",
    12: "KC",
    13: "LV",
    14: "LAR",
    15: "MIA",
    16: "MIN",
    17: "NE",
    18: "NO",
    19: "NYG",
    20: "NYJ",
    21: "PHI",
    22: "ARI",
    23: "PIT",
    24: "LAC",
    25: "SF",
    26: "SEA",
    27: "TB",
    28: "WSH",
    29: "CAR",
    30: "JAX",
    33: "BAL",
    34: "HOU",
}


async def get_league_rosters(espn: EspnClient, season: int) -> LeagueRostersResponse:
    raw = await espn.fetch_league(season, views=["mRoster"])
    parsed = RawLeagueRostersResponse.model_validate(raw)

    teams: list[TeamRosterOut] = []
    warnings: list[str] = []

    for team in parsed.teams:
        players: list[RosterPlayerOut] = []

        for entry in team.roster.entries:
            player = entry.playerPoolEntry.player
            name = sanitize_name(player.fullName)
            if not name:
                warnings.append(f"Skipped a player on ESPN team {team.id}: no usable name")
                continue

            players.append(
                RosterPlayerOut(
                    name=name,
                    position=_POSITIONS.get(player.defaultPositionId, "?"),
                    pro_team=_PRO_TEAMS.get(player.proTeamId, "FA"),
                    lineup_slot=_LINEUP_SLOTS.get(entry.lineupSlotId, "?"),
                    is_starter=entry.lineupSlotId not in _BENCH_SLOTS,
                )
            )

        teams.append(TeamRosterOut(espn_team_id=team.id, players=players))

    return LeagueRostersResponse(
        season=season,
        league_id=str(parsed.id),
        fetched_at=datetime.now(UTC).isoformat(),
        teams=teams,
        warnings=warnings,
    )
