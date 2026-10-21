"""Fetch and map ESPN schedule/matchup (`mMatchupScore`) data.

No sanitize.py pass here, unlike services/league.py and services/roster.py -- this view
carries no PII (no `members`, no names), just numeric team ids and scores.
"""

from datetime import UTC, datetime

from app.clients.espn import EspnClient
from app.schemas.api import LeagueScheduleResponse, MatchupOut
from app.schemas.espn_raw import RawLeagueScheduleResponse


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
                home_score=matchup.home.totalPoints,
                away_espn_team_id=matchup.away.teamId,
                away_score=matchup.away.totalPoints,
                winner=matchup.winner,
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
