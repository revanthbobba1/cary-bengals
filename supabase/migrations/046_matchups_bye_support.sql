-- ESPN integration -- playoff bye-week support. This league's playoffs are 6 teams: 4 play
-- head-to-head and 2 sit out each week. Confirmed against a real 2025 mMatchupScore payload: ESPN
-- sends a bye as a matchup entry with only `home` populated (`away` absent) and winner
-- "UNDECIDED" permanently. The sync previously skipped any such entry, so a bye team had no
-- matchups row at all. Whichever side ESPN populates is normalized into home_*, so only the away
-- columns become nullable; is_bye + the CHECK keep the two shapes from drifting apart.

ALTER TABLE public.matchups
  ALTER COLUMN away_team_id DROP NOT NULL,
  ALTER COLUMN away_score DROP NOT NULL,
  ALTER COLUMN away_score DROP DEFAULT,
  ADD COLUMN is_bye BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT matchups_bye_consistency CHECK (
    (is_bye = false AND away_team_id IS NOT NULL AND away_score IS NOT NULL)
    OR (is_bye = true AND away_team_id IS NULL AND away_score IS NULL)
  );

-- CREATE OR REPLACE on top of 044's version (adds is_bye to the upsert; the service_role branch
-- and everything else carries over unchanged). A JSON null away_team_id/away_score casts
-- cleanly to SQL NULL, so no other change is needed for a bye row.
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
  IF NOT (public.jwt_has_role('commissioner') OR auth.role() = 'service_role') THEN
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
      home_score, away_score, winner, espn_matchup_id, synced_at,
      home_projected_score, away_projected_score, home_win_probability, away_win_probability,
      is_bye
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
      now(),
      (v_matchup->>'home_projected_score')::numeric,
      (v_matchup->>'away_projected_score')::numeric,
      (v_matchup->>'home_win_probability')::numeric,
      (v_matchup->>'away_win_probability')::numeric,
      COALESCE((v_matchup->>'is_bye')::boolean, false)
    )
    ON CONFLICT (season_year, espn_matchup_id) DO UPDATE SET
      week_number = EXCLUDED.week_number,
      is_playoffs = EXCLUDED.is_playoffs,
      home_team_id = EXCLUDED.home_team_id,
      away_team_id = EXCLUDED.away_team_id,
      home_score = EXCLUDED.home_score,
      away_score = EXCLUDED.away_score,
      winner = EXCLUDED.winner,
      synced_at = now(),
      home_projected_score = EXCLUDED.home_projected_score,
      away_projected_score = EXCLUDED.away_projected_score,
      home_win_probability = EXCLUDED.home_win_probability,
      away_win_probability = EXCLUDED.away_win_probability,
      is_bye = EXCLUDED.is_bye
    WHERE
      public.matchups.week_number IS DISTINCT FROM EXCLUDED.week_number
      OR public.matchups.is_playoffs IS DISTINCT FROM EXCLUDED.is_playoffs
      OR public.matchups.home_team_id IS DISTINCT FROM EXCLUDED.home_team_id
      OR public.matchups.away_team_id IS DISTINCT FROM EXCLUDED.away_team_id
      OR public.matchups.home_score IS DISTINCT FROM EXCLUDED.home_score
      OR public.matchups.away_score IS DISTINCT FROM EXCLUDED.away_score
      OR public.matchups.winner IS DISTINCT FROM EXCLUDED.winner
      OR public.matchups.home_projected_score IS DISTINCT FROM EXCLUDED.home_projected_score
      OR public.matchups.away_projected_score IS DISTINCT FROM EXCLUDED.away_projected_score
      OR public.matchups.home_win_probability IS DISTINCT FROM EXCLUDED.home_win_probability
      OR public.matchups.away_win_probability IS DISTINCT FROM EXCLUDED.away_win_probability
      OR public.matchups.is_bye IS DISTINCT FROM EXCLUDED.is_bye;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    v_results := v_results || jsonb_build_object(
      'espn_matchup_id', v_matchup->>'espn_matchup_id', 'updated', v_updated_count > 0
    );
  END LOOP;

  RETURN v_results;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_matchups(integer, integer, jsonb) TO authenticated, service_role;
