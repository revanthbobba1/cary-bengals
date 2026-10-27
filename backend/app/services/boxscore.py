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

import asyncio
from datetime import UTC, datetime

import httpx

from app.clients.espn import EspnClient, EspnRequestError
from app.espn_labels import label_player, label_stat_breakdown
from app.schemas.api import BoxScorePlayerOut, LeagueBoxScoresResponse, MatchupBoxScoreOut
from app.schemas.espn_raw import (
    RawBoxScoreEntry,
    RawBoxScoreStat,
    RawLeagueBoxScoresResponse,
    RawProTeamsResponse,
)

# ESPN's "actual, live" stats line, as opposed to statSourceId 1 ("projected") -- confirmed
# against a real captured payload: before a game starts, only a statSourceId=1 entry exists and
# the team's own totalPoints is 0, so player points here mirror that (0 until the real game
# generates an actual stat line) instead of showing a pre-game projection the team score doesn't
# reflect yet.
_ACTUAL_STAT_SOURCE_ID = 0


_IR_LINEUP_SLOT_ID = 21


def _actual_stat(entry: RawBoxScoreEntry) -> RawBoxScoreStat | None:
    for stat in entry.playerPoolEntry.player.stats:
        if stat.statSourceId == _ACTUAL_STAT_SOURCE_ID:
            return stat
    return None


def _availability(
    entry: RawBoxScoreEntry, actual: RawBoxScoreStat | None, on_bye: bool
) -> str | None:
    """Why a player has no stat line, or None if they played. Derived from a live capture:
    played = an actual line with non-empty `stats`; DNP = an actual line with empty `stats`
    (the team played, the player didn't -- not always an injury); no actual line at all = either
    the NFL team is on bye or the game hasn't started, told apart only by the pro team's
    byeWeek (see _load_bye_teams)."""
    # appliedTotal is a second signal, not just `stats`: real points must never be hidden behind
    # a DNP label if a line ever arrives with points but an empty stats map.
    if actual is not None and (actual.stats or actual.appliedTotal):
        return None
    if on_bye:
        return "bye"
    if entry.lineupSlotId == _IR_LINEUP_SLOT_ID:
        return "ir"
    if entry.playerPoolEntry.player.injuryStatus == "OUT":
        return "out"
    return "dnp" if actual is not None else "pending"


async def _fetch_pro_teams(espn: EspnClient, season: int) -> RawProTeamsResponse | str:
    """NFL pro team data (for bye weeks), or a warning string if it couldn't be loaded.
    Best-effort: the box score is still useful without it, so a would-be bye just reads as
    "pending" instead of failing the sync. Never raises, so it can run alongside the league
    fetch without masking that fetch's own errors."""
    try:
        return RawProTeamsResponse.model_validate(await espn.fetch_pro_teams(season))
    except (EspnRequestError, httpx.HTTPError, ValueError) as exc:
        return f"Could not load NFL bye weeks ({type(exc).__name__}); byes show as pending"


async def get_league_box_scores(espn: EspnClient, season: int) -> LeagueBoxScoresResponse:
    # Concurrent, not sequential: the two calls are independent, and this runs under a tight
    # synchronous deadline (see lib/espn/client.ts).
    raw, pro_teams = await asyncio.gather(
        espn.fetch_league(season, views=["mMatchupScore", "mLiveScoring"]),
        _fetch_pro_teams(espn, season),
    )
    parsed = RawLeagueBoxScoresResponse.model_validate(raw)

    matchups: list[MatchupBoxScoreOut] = []
    warnings: list[str] = []
    bye_teams: set[int] = set()
    if isinstance(pro_teams, str):
        warnings.append(pro_teams)
    elif parsed.scoringPeriodId is not None:
        bye_teams = {
            team.id
            for team in pro_teams.settings.proTeams
            if team.byeWeek == parsed.scoringPeriodId
        }

    for matchup in parsed.schedule:
        # Same bye normalization as services/schedule.py: a one-sided entry is always reported as
        # "home", so its box score attaches to the same side as its matchups row.
        sides = [("home", matchup.home), ("away", matchup.away)]
        if (matchup.home is None) != (matchup.away is None):
            sides = [("home", matchup.home or matchup.away)]

        for team_side, team in sides:
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

                actual = _actual_stat(entry)
                players.append(
                    BoxScorePlayerOut(
                        name=labeled.name,
                        position=labeled.position,
                        pro_team=labeled.pro_team,
                        lineup_slot=labeled.lineup_slot,
                        is_starter=labeled.is_starter,
                        points=actual.appliedTotal if actual else 0.0,
                        stat_breakdown=label_stat_breakdown(actual.stats) if actual else {},
                        availability=_availability(entry, actual, player.proTeamId in bye_teams),
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
