"""Fetch and map ESPN per-player box-score (`mMatchupScore` + `mLiveScoring`) data.

`mLiveScoring` is required alongside `mMatchupScore` -- with `mMatchupScore` alone, ESPN's
`rosterForCurrentScoringPeriod` player objects carry only `stats`, no id/name/position (confirmed
against a real captured payload; see RawMatchupTeam's comment in schemas/espn_raw.py). This is a
separate fetch from services/schedule.py's, not an addition to it -- see docs/
ESPN_INTEGRATION_PLAN.md's box-score note for why this is its own dedicated view rather than a
field bolted onto the existing team-level schedule summary.

No sanitize.py pass for names here, unlike roster.py: real NFL player names are public figures'
names, not user-entered PII, same reasoning as roster.py's own fullName handling -- sanitize_name
is still used, but only for its control-character/length hygiene, not out of a PII concern.
"""

from datetime import UTC, datetime

from app.clients.espn import EspnClient
from app.espn_labels import BENCH_SLOTS, LINEUP_SLOTS, POSITIONS, PRO_TEAMS
from app.sanitize import sanitize_name
from app.schemas.api import BoxScorePlayerOut, LeagueBoxScoresResponse, MatchupBoxScoreOut
from app.schemas.espn_raw import RawBoxScoreEntry, RawLeagueScheduleResponse

# ESPN's "actual, live" stats line, as opposed to statSourceId 1 ("projected") -- confirmed
# against a real captured payload: before a game starts, only a statSourceId=1 entry exists and
# the team's own totalPoints is 0, so player points here mirror that (0 until the real game
# generates an actual stat line) instead of showing a pre-game projection the team score doesn't
# reflect yet.
_ACTUAL_STAT_SOURCE_ID = 0


def _player_points(entry: RawBoxScoreEntry) -> float:
    for stat in entry.playerPoolEntry.player.stats:
        if stat.statSourceId == _ACTUAL_STAT_SOURCE_ID:
            return stat.appliedTotal
    return 0.0


async def get_league_box_scores(espn: EspnClient, season: int) -> LeagueBoxScoresResponse:
    raw = await espn.fetch_league(season, views=["mMatchupScore", "mLiveScoring"])
    parsed = RawLeagueScheduleResponse.model_validate(raw)

    matchups: list[MatchupBoxScoreOut] = []
    warnings: list[str] = []

    for matchup in parsed.schedule:
        for team_side, team in (("home", matchup.home), ("away", matchup.away)):
            if team is None or team.rosterForCurrentScoringPeriod is None:
                continue

            players: list[BoxScorePlayerOut] = []
            for entry in team.rosterForCurrentScoringPeriod.entries:
                player = entry.playerPoolEntry.player
                name = sanitize_name(player.fullName)
                if not name:
                    warnings.append(
                        f"Skipped a player in matchup {matchup.id} ({team_side}): no usable name"
                    )
                    continue

                players.append(
                    BoxScorePlayerOut(
                        name=name,
                        position=POSITIONS.get(player.defaultPositionId, "?"),
                        pro_team=PRO_TEAMS.get(player.proTeamId, "FA"),
                        lineup_slot=LINEUP_SLOTS.get(entry.lineupSlotId, "?"),
                        is_starter=entry.lineupSlotId not in BENCH_SLOTS,
                        points=_player_points(entry),
                    )
                )

            matchups.append(
                MatchupBoxScoreOut(
                    espn_matchup_id=matchup.id,
                    team_side=team_side,
                    players=players,
                )
            )

    return LeagueBoxScoresResponse(
        season=season,
        league_id=str(parsed.id),
        fetched_at=datetime.now(UTC).isoformat(),
        matchups=matchups,
        warnings=warnings,
    )
