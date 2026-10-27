"""Fetch and sanitize ESPN roster (`mRoster`) data.

Position/lineup-slot/pro-team IDs are ESPN's own undocumented numeric codes — the payload never
carries a human-readable label for any of them. The mappings in espn_labels.py are the standard
values the fantasy-football community has reverse-engineered (see docs/ESPN_INTEGRATION_PLAN.md
§7), and were cross-checked against a real captured league payload: every position/slot code
matched a real, identifiable player at that code (e.g. position 2 = RB confirmed via Christian
McCaffrey, Saquon Barkley, etc.; slot 20 = Bench confirmed via known backups sitting there).
Pro-team abbreviations are the standard ESPN table and are purely cosmetic display text — an
occasional mismatch for a very recently traded/signed player has no effect on starter/bench
correctness, which depends only on lineup_slot. Shared with services/boxscore.py, which needs the
same codes.
"""

from datetime import UTC, datetime

from app.clients.espn import EspnClient
from app.espn_labels import label_player
from app.schemas.api import LeagueRostersResponse, RosterPlayerOut, TeamRosterOut
from app.schemas.espn_raw import RawLeagueRostersResponse


async def get_league_rosters(espn: EspnClient, season: int) -> LeagueRostersResponse:
    raw = await espn.fetch_league(season, views=["mRoster"])
    parsed = RawLeagueRostersResponse.model_validate(raw)

    teams: list[TeamRosterOut] = []
    warnings: list[str] = []

    for team in parsed.teams:
        players: list[RosterPlayerOut] = []

        for entry in team.roster.entries:
            player = entry.playerPoolEntry.player
            labeled = label_player(
                player.fullName, player.defaultPositionId, player.proTeamId, entry.lineupSlotId
            )
            if labeled is None:
                warnings.append(f"Skipped a player on ESPN team {team.id}: no usable name")
                continue

            players.append(
                RosterPlayerOut(
                    name=labeled.name,
                    position=labeled.position,
                    pro_team=labeled.pro_team,
                    lineup_slot=labeled.lineup_slot,
                    is_starter=labeled.is_starter,
                    injured=player.injured,
                    acquisition_type=entry.acquisitionType,
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
