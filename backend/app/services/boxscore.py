"""Fetch and map ESPN per-player box-score (`mMatchupScore` + `mLiveScoring`) data.

`mLiveScoring` is required alongside `mMatchupScore` -- with `mMatchupScore` alone, ESPN's
`rosterForCurrentScoringPeriod` player objects carry only `stats`, no id/name/position (confirmed
against both a real captured payload and a live probe). This is a separate fetch from
services/schedule.py's, not an addition to it, with its own fully separate raw schema
(`RawLeagueBoxScoresResponse` and friends in schemas/espn_raw.py) rather than sharing
schedule.py's `RawMatchupTeam`/`RawMatchup`/`RawLeagueScheduleResponse` -- those are parsed from
schedule.py's narrower mMatchupScore-only fetch, which never has player identity, so sharing a
model with required identity fields there crashed matchup sync in production (see
docs/ESPN_INTEGRATION_PLAN.md's hotfix note).

Per-player name/position/pro-team/lineup-slot resolution (`label_player`) is shared with
roster.py via espn_labels.py, since both parse the identical ESPN entry shape (a lineup slot id
plus a `playerPoolEntry.player`) -- only the points field and the warning message differ here.
"""

from datetime import UTC, datetime

from app.clients.espn import EspnClient
from app.espn_labels import label_player
from app.schemas.api import BoxScorePlayerOut, LeagueBoxScoresResponse, MatchupBoxScoreOut
from app.schemas.espn_raw import RawBoxScoreEntry, RawLeagueBoxScoresResponse

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
    parsed = RawLeagueBoxScoresResponse.model_validate(raw)

    matchups: list[MatchupBoxScoreOut] = []
    warnings: list[str] = []

    for matchup in parsed.schedule:
        for team_side, team in (("home", matchup.home), ("away", matchup.away)):
            if team is None or team.rosterForCurrentScoringPeriod is None:
                continue

            players: list[BoxScorePlayerOut] = []
            for entry in team.rosterForCurrentScoringPeriod.entries:
                player = entry.playerPoolEntry.player
                labeled = label_player(
                    player.fullName, player.defaultPositionId, player.proTeamId, entry.lineupSlotId
                )
                if labeled is None:
                    warnings.append(
                        f"Skipped a player in matchup {matchup.id} ({team_side}): no usable name"
                    )
                    continue

                players.append(
                    BoxScorePlayerOut(
                        name=labeled.name,
                        position=labeled.position,
                        pro_team=labeled.pro_team,
                        lineup_slot=labeled.lineup_slot,
                        is_starter=labeled.is_starter,
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
