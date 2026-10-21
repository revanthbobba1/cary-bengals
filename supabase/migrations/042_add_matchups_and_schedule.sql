-- ESPN integration — Phase 8c (matchups/scoreboard), docs/ESPN_INTEGRATION_PLAN.md §9.
--
-- New data this phase needs that nothing earlier captured: head-to-head matchups with scores
-- (`matchups`) and ESPN's own notion of "what week is it" (`espn_schedule_state`). The latter is
-- its own tiny table rather than reusing `poll_weeks`' manually-managed "open week" -- that's an
-- independent, commissioner-driven concept, and coupling /scoreboard to it means a forgotten
-- poll-week creation silently makes the scoreboard show a stale week. `espn_schedule_state` is
-- instead upserted by sync_matchups() itself, straight from the value ESPN's own API returns.
--
-- Commissioner-gated only in this migration, same as every sync RPC before it -- the
-- service_role bypass branch for a scheduled/cron sync is a clearly separate follow-up (see the
-- plan's sequencing note), not bundled into this first pass.

CREATE TABLE public.matchups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_year INTEGER NOT NULL,
  week_number INTEGER NOT NULL,
  is_playoffs BOOLEAN NOT NULL DEFAULT false,
  home_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  away_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  home_score NUMERIC(6,2) NOT NULL DEFAULT 0,
  away_score NUMERIC(6,2) NOT NULL DEFAULT 0,
  winner TEXT NOT NULL DEFAULT 'UNDECIDED',
  espn_matchup_id INTEGER NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(season_year, espn_matchup_id)
);

CREATE INDEX idx_matchups_season_week ON public.matchups(season_year, week_number);

ALTER TABLE public.matchups ENABLE ROW LEVEL SECURITY;

-- Same shape as teams'/team_rosters' own policies: public read, commissioner-only write.
CREATE POLICY "Public can view matchups"
  ON public.matchups FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Commissioner can manage matchups"
  ON public.matchups FOR ALL
  TO authenticated
  USING (public.jwt_has_role('commissioner'));

CREATE TABLE public.espn_schedule_state (
  season_year INTEGER PRIMARY KEY,
  current_week INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.espn_schedule_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view schedule state"
  ON public.espn_schedule_state FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Commissioner can manage schedule state"
  ON public.espn_schedule_state FOR ALL
  TO authenticated
  USING (public.jwt_has_role('commissioner'));

-- Same per-batch-transaction pattern as sync_espn_teams (035)/sync_team_records (041), with one
-- difference: an UPSERT (ON CONFLICT), not rosters' delete+reinsert. A matchup has stable
-- identity across syncs (espn_matchup_id), and reinserting all 84 rows every refresh during live
-- games would be needless churn for data that's mostly unchanged between polls.
--
-- The ON CONFLICT DO UPDATE carries a WHERE clause so a conflict with no actual value change is a
-- no-op (ROW_COUNT 0), not an unconditional write -- otherwise 'updated' would be true for every
-- already-synced matchup on every refresh, even ones ESPN hasn't touched since the last poll,
-- which would make the result unusable for reporting "N matchups actually changed."
CREATE OR REPLACE FUNCTION public.sync_matchups(
  p_season_year integer, p_current_week integer, p_matchups jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_matchup jsonb;
  v_updated_count integer;
  v_results jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.jwt_has_role('commissioner') THEN
    RAISE EXCEPTION 'Commissioner access required.';
  END IF;

  INSERT INTO public.espn_schedule_state (season_year, current_week)
  VALUES (p_season_year, p_current_week)
  ON CONFLICT (season_year) DO UPDATE SET
    current_week = EXCLUDED.current_week, updated_at = now();

  FOR v_matchup IN SELECT * FROM jsonb_array_elements(p_matchups)
  LOOP
    INSERT INTO public.matchups (
      season_year, week_number, is_playoffs, home_team_id, away_team_id,
      home_score, away_score, winner, espn_matchup_id, synced_at
    )
    VALUES (
      p_season_year,
      (v_matchup->>'week_number')::integer,
      (v_matchup->>'is_playoffs')::boolean,
      (v_matchup->>'home_team_id')::uuid,
      (v_matchup->>'away_team_id')::uuid,
      (v_matchup->>'home_score')::numeric,
      (v_matchup->>'away_score')::numeric,
      v_matchup->>'winner',
      (v_matchup->>'espn_matchup_id')::integer,
      now()
    )
    ON CONFLICT (season_year, espn_matchup_id) DO UPDATE SET
      week_number = EXCLUDED.week_number,
      is_playoffs = EXCLUDED.is_playoffs,
      home_team_id = EXCLUDED.home_team_id,
      away_team_id = EXCLUDED.away_team_id,
      home_score = EXCLUDED.home_score,
      away_score = EXCLUDED.away_score,
      winner = EXCLUDED.winner,
      synced_at = now()
    WHERE
      public.matchups.week_number IS DISTINCT FROM EXCLUDED.week_number
      OR public.matchups.is_playoffs IS DISTINCT FROM EXCLUDED.is_playoffs
      OR public.matchups.home_team_id IS DISTINCT FROM EXCLUDED.home_team_id
      OR public.matchups.away_team_id IS DISTINCT FROM EXCLUDED.away_team_id
      OR public.matchups.home_score IS DISTINCT FROM EXCLUDED.home_score
      OR public.matchups.away_score IS DISTINCT FROM EXCLUDED.away_score
      OR public.matchups.winner IS DISTINCT FROM EXCLUDED.winner;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    v_results := v_results || jsonb_build_object(
      'espn_matchup_id', v_matchup->>'espn_matchup_id', 'updated', v_updated_count > 0
    );
  END LOOP;

  RETURN v_results;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_matchups(integer, integer, jsonb) TO authenticated;
