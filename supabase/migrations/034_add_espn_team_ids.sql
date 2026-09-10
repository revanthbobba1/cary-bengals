-- ESPN integration (docs/ESPN_INTEGRATION_PLAN.md §2.3) — Phase 5. Additive only: doesn't touch
-- teams' existing UNIQUE(name, season_year) constraint or anything the poll system depends on.
--
-- Sync key is espn_team_id, not name or owner: team names change mid-season (part of the fun of
-- this league), and ESPN's owners[] can hold multiple IDs for a co-owned team, making owner
-- ambiguous as a sole match key. espn_team_id is the one stable identifier ESPN treats as fixed
-- for a roster/record entity across a season, so a sync can always find "the same team" even
-- after a rename or an owner swap.
--
-- The unique index is partial (WHERE espn_team_id IS NOT NULL) to make the "not yet synced" state
-- an explicit, intentional case rather than something that happens to work because Postgres
-- treats NULLs as distinct in a unique index. The 12 existing 2026 rows predate ESPN sync and
-- have no ESPN ID yet; a plain table-level UNIQUE constraint can't carry a WHERE clause at all,
-- so a filtered index is the only way to scope the uniqueness to rows that have actually synced.
ALTER TABLE public.teams ADD COLUMN espn_team_id INTEGER;
ALTER TABLE public.teams ADD COLUMN espn_owner_id TEXT;
ALTER TABLE public.teams ADD COLUMN espn_synced_at TIMESTAMPTZ;

CREATE UNIQUE INDEX teams_season_espn_id
  ON public.teams (season_year, espn_team_id)
  WHERE espn_team_id IS NOT NULL;
