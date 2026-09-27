"""Orchestration: fetch from ESPN, sanitize, map to our outward DTOs.

Sanitization order follows docs/ESPN_INTEGRATION_PLAN.md §5:
1. Structural validation (RawLeagueResponse.model_validate) happens in the caller.
2. Name resolution — skip a team with no usable name, report it in `warnings`.
3. String hygiene — see app.sanitize.sanitize_name (shared with services/roster.py).
4. Owner name is a suggestion only — resolved here for convenience, never
   auto-applied over a curated value (that decision belongs to the caller,
   e.g. the commissioner-facing preview UI).
"""

from datetime import UTC, datetime

from app.clients.espn import EspnClient
from app.sanitize import sanitize_name
from app.schemas.api import LeagueTeamsResponse, TeamOut, TeamRecordOut
from app.schemas.espn_raw import RawLeagueResponse


async def get_league_teams(espn: EspnClient, season: int) -> LeagueTeamsResponse:
    raw = await espn.fetch_league(season, views=["mTeam"])
    parsed = RawLeagueResponse.model_validate(raw)

    members_by_id = {member.id: member for member in parsed.members}

    teams: list[TeamOut] = []
    warnings: list[str] = []

    for team in parsed.teams:
        name = sanitize_name(team.name)
        if not name:
            warnings.append(f"Skipped team id={team.id}: no usable name")
            continue

        owner_id = team.primaryOwner
        owner_display_name = None
        if owner_id and owner_id in members_by_id:
            owner_display_name = sanitize_name(members_by_id[owner_id].displayName) or None

        teams.append(
            TeamOut(
                espn_team_id=team.id,
                name=name,
                espn_owner_id=owner_id,
                owner_display_name=owner_display_name,
                record=TeamRecordOut(
                    wins=team.record.overall.wins,
                    losses=team.record.overall.losses,
                    ties=team.record.overall.ties,
                ),
            )
        )

    return LeagueTeamsResponse(
        season=season,
        league_id=str(parsed.id),
        fetched_at=datetime.now(UTC).isoformat(),
        teams=teams,
        warnings=warnings,
    )
