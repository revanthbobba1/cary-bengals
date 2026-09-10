"""Orchestration: fetch from ESPN, sanitize, map to our outward DTOs.

Sanitization order follows docs/ESPN_INTEGRATION_PLAN.md §5:
1. Structural validation (RawLeagueResponse.model_validate) happens in the caller.
2. Name resolution — skip a team with no usable name, report it in `warnings`.
3. String hygiene — NFKC normalize, strip control/zero-width/bidi-override
   chars and HTML tags, collapse whitespace, trim, cap length. Emoji and
   punctuation are deliberately preserved (existing team names use both).
4. Owner name is a suggestion only — resolved here for convenience, never
   auto-applied over a curated value (that decision belongs to the caller,
   e.g. the commissioner-facing preview UI).
"""

import re
import unicodedata
from datetime import UTC, datetime

from app.clients.espn import EspnClient
from app.schemas.api import LeagueTeamsResponse, TeamOut, TeamRecordOut
from app.schemas.espn_raw import RawLeagueResponse

_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")
_HTML_TAGS = re.compile(r"<[^>]+>")
_WHITESPACE = re.compile(r"\s+")
_MAX_NAME_LENGTH = 100

# Zero-width spaces/joiners (U+200B-U+200F) and bidi-override controls
# (U+202A-U+202E) — spelled out as codepoints rather than literal characters
# so the source stays readable instead of hiding invisible glyphs inline.
_INVISIBLE_CODEPOINTS = frozenset([*range(0x200B, 0x2010), *range(0x202A, 0x202F)])


def _sanitize_name(raw: str | None) -> str:
    if not raw:
        return ""
    value = unicodedata.normalize("NFKC", raw)
    value = "".join(ch for ch in value if ord(ch) not in _INVISIBLE_CODEPOINTS)
    value = _CONTROL_CHARS.sub("", value)
    value = _HTML_TAGS.sub("", value)
    value = _WHITESPACE.sub(" ", value).strip()
    return value[:_MAX_NAME_LENGTH]


async def get_league_teams(espn: EspnClient, season: int) -> LeagueTeamsResponse:
    raw = await espn.fetch_league(season, views=["mTeam"])
    parsed = RawLeagueResponse.model_validate(raw)

    members_by_id = {member.id: member for member in parsed.members}

    teams: list[TeamOut] = []
    warnings: list[str] = []

    for team in parsed.teams:
        name = _sanitize_name(team.name)
        if not name:
            warnings.append(f"Skipped team id={team.id}: no usable name")
            continue

        owner_id = team.primaryOwner
        owner_display_name = None
        if owner_id and owner_id in members_by_id:
            owner_display_name = _sanitize_name(members_by_id[owner_id].displayName) or None

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
