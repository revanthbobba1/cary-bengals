"""Fetch and map ESPN schedule/matchup (`mMatchupScore`) data.

No sanitize.py pass here, unlike services/league.py and services/roster.py -- this view
carries no PII (no `members`, no names), just numeric team ids and scores.
"""

from datetime import UTC, datetime

from app.clients.espn import EspnClient
from app.schemas.api import LeagueScheduleResponse, MatchupOut
from app.schemas.espn_raw import RawLeagueScheduleResponse, RawMatchupTeam


def _team_score(team: RawMatchupTeam) -> float:
    # totalPoints is stuck at 0 until the week finalizes; totalPointsLive carries the running score.
    return team.totalPointsLive if team.totalPointsLive is not None else team.totalPoints


async def get_league_schedule(espn: EspnClient, season: int) -> LeagueScheduleResponse:
    raw = await espn.fetch_league(season, views=["mMatchupScore"])
    parsed = RawLeagueScheduleResponse.model_validate(raw)

    matchups: list[MatchupOut] = []
    warnings: list[str] = []

    for matchup in parsed.schedule:
        if matchup.home is None or matchup.away is None:
            warnings.append(f"Skipped matchup id={matchup.id}: missing a home or away team (bye?)")
            continue

        matchups.append(
            MatchupOut(
                espn_matchup_id=matchup.id,
                week=matchup.matchupPeriodId,
                is_playoffs=matchup.playoffTierType != "NONE",
                home_espn_team_id=matchup.home.teamId,
                home_score=_team_score(matchup.home),
                away_espn_team_id=matchup.away.teamId,
                away_score=_team_score(matchup.away),
                winner=matchup.winner,
                home_projected_score=matchup.home.totalProjectedPoints,
                away_projected_score=matchup.away.totalProjectedPoints,
                home_win_probability=matchup.home.winProbability,
                away_win_probability=matchup.away.winProbability,
            )
        )

    return LeagueScheduleResponse(
        season=season,
        league_id=str(parsed.id),
        fetched_at=datetime.now(UTC).isoformat(),
        current_week=parsed.status.currentMatchupPeriod,
        matchups=matchups,
        warnings=warnings,
    )
