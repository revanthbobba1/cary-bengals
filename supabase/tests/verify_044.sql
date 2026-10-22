-- Verification for migration 044 (matchup projected score + win probability columns).
-- Run after applying 044, e.g.:
--   supabase db query --linked --file supabase/tests/verify_044.sql
-- Wrapped in BEGIN/ROLLBACK so nothing persists -- safe to run against a real project.
--
-- The commissioner/service_role gating and the basic upsert-not-duplicate behavior are already
-- covered by verify_042.sql/verify_043.sql, so this focuses only on what 044 actually changes:
-- the four new columns round-trip correctly, and the ON CONFLICT ... WHERE guard correctly
-- treats a projection/win-probability-only change (including going to/from NULL, which is the
-- normal "week is no longer current" transition) as a real update.

BEGIN;

DO $verify$
DECLARE
  v_commissioner uuid := gen_random_uuid();
  v_team_a uuid := gen_random_uuid();
  v_team_b uuid := gen_random_uuid();
  v_sync_result jsonb;
  v_home_projected numeric;
  v_home_win_prob numeric;
BEGIN
  INSERT INTO public.teams (id, name, owner_name, season_year, espn_team_id)
  VALUES
    (v_team_a, 'Verify044 Team A', 'Owner A', 1997, 9046),
    (v_team_b, 'Verify044 Team B', 'Owner B', 1997, 9047);

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_commissioner,
    'role', 'authenticated',
    'app_metadata', json_build_object('roles', json_build_array('commissioner'))
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- -------------------------------------------------------------------------
  -- 1. First sync carries a projection + win probability (the "current week" shape).
  -- -------------------------------------------------------------------------
  PERFORM public.sync_matchups(1997, 7, jsonb_build_array(
    jsonb_build_object(
      'espn_matchup_id', 1, 'week_number', 7, 'is_playoffs', false,
      'home_team_id', v_team_a, 'away_team_id', v_team_b,
      'home_score', 0.0, 'away_score', 0.0, 'winner', 'UNDECIDED',
      'home_projected_score', 117.78, 'away_projected_score', 113.44,
      'home_win_probability', 0.52, 'away_win_probability', 0.48
    )
  ));

  SELECT home_projected_score, home_win_probability INTO v_home_projected, v_home_win_prob
    FROM public.matchups WHERE season_year = 1997 AND espn_matchup_id = 1;
  IF v_home_projected != 117.78 OR v_home_win_prob != 0.52 THEN
    RAISE EXCEPTION 'FAIL 1: projection/win probability did not round-trip -- got % / %',
      v_home_projected, v_home_win_prob;
  END IF;
  RAISE NOTICE 'PASS 1: projected score and win probability round-trip through sync_matchups';

  -- -------------------------------------------------------------------------
  -- 2. A re-sync with only the win probability changed (scores/winner identical) is still
  --    reported as updated -- confirms the new columns are in the ON CONFLICT ... WHERE guard,
  --    not just the INSERT/UPDATE SET list.
  -- -------------------------------------------------------------------------
  v_sync_result := public.sync_matchups(1997, 7, jsonb_build_array(
    jsonb_build_object(
      'espn_matchup_id', 1, 'week_number', 7, 'is_playoffs', false,
      'home_team_id', v_team_a, 'away_team_id', v_team_b,
      'home_score', 0.0, 'away_score', 0.0, 'winner', 'UNDECIDED',
      'home_projected_score', 117.78, 'away_projected_score', 113.44,
      'home_win_probability', 0.61, 'away_win_probability', 0.39
    )
  ));
  IF (v_sync_result->0->>'updated')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL 2: a win-probability-only change was not reported as updated -- got %',
      v_sync_result;
  END IF;
  RAISE NOTICE 'PASS 2: a win-probability-only change is detected by the WHERE guard';

  -- -------------------------------------------------------------------------
  -- 3. A re-sync that omits the projection/win-probability fields entirely (the normal shape
  --    once a week is no longer current) nulls them out and is still reported as updated --
  --    confirms NULL is treated as a real value change, not silently ignored.
  -- -------------------------------------------------------------------------
  v_sync_result := public.sync_matchups(1997, 8, jsonb_build_array(
    jsonb_build_object(
      'espn_matchup_id', 1, 'week_number', 7, 'is_playoffs', false,
      'home_team_id', v_team_a, 'away_team_id', v_team_b,
      'home_score', 121.3, 'away_score', 98.2, 'winner', 'HOME'
    )
  ));
  IF (v_sync_result->0->>'updated')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL 3: clearing the projection fields was not reported as updated -- got %',
      v_sync_result;
  END IF;

  SELECT home_projected_score, home_win_probability INTO v_home_projected, v_home_win_prob
    FROM public.matchups WHERE season_year = 1997 AND espn_matchup_id = 1;
  IF v_home_projected IS NOT NULL OR v_home_win_prob IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 3: projection/win probability should be NULL once the week has passed -- got % / %',
      v_home_projected, v_home_win_prob;
  END IF;
  RAISE NOTICE 'PASS 3: an omitted projection/win probability nulls out the stored value';

  EXECUTE 'RESET ROLE';

  RAISE NOTICE 'All 3 checks passed.';
END
$verify$;

ROLLBACK;
