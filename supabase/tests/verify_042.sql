-- Verification for migration 042 (matchups + espn_schedule_state).
-- Run after applying 042, e.g.:
--   supabase db query --linked --file supabase/tests/verify_042.sql
-- Wrapped in BEGIN/ROLLBACK so nothing persists -- safe to run against a real project. Uses
-- set_config('request.jwt.claims', ...) + SET LOCAL ROLE, same pattern as verify_041.sql.

BEGIN;

DO $verify$
DECLARE
  v_commissioner uuid := gen_random_uuid();
  v_member uuid := gen_random_uuid();
  v_team_a uuid := gen_random_uuid();
  v_team_b uuid := gen_random_uuid();
  v_sync_result jsonb;
  v_matchup_count integer;
  v_current_week integer;
  v_home_score numeric;
BEGIN
  -- -------------------------------------------------------------------------
  -- Fixtures: two teams in an isolated season.
  -- -------------------------------------------------------------------------
  INSERT INTO public.teams (id, name, owner_name, season_year, espn_team_id)
  VALUES
    (v_team_a, 'Verify042 Team A', 'Owner A', 1999, 9042),
    (v_team_b, 'Verify042 Team B', 'Owner B', 1999, 9043);

  INSERT INTO auth.users (id, aud, role, email)
  VALUES (v_member, 'authenticated', 'authenticated', 'verify042-member@example.test');

  -- -------------------------------------------------------------------------
  -- 1. sync_matchups refuses a non-commissioner.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_member,
    'role', 'authenticated',
    'app_metadata', json_build_object('roles', json_build_array('admin'))
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    PERFORM public.sync_matchups(1999, 1, jsonb_build_array(
      jsonb_build_object(
        'espn_matchup_id', 1, 'week_number', 1, 'is_playoffs', false,
        'home_team_id', v_team_a, 'away_team_id', v_team_b,
        'home_score', 100.0, 'away_score', 90.0, 'winner', 'HOME'
      )
    ));
    RAISE EXCEPTION 'FAIL 1: a plain admin was allowed to sync matchups';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM != 'Commissioner access required.' THEN
        RAISE;
      END IF;
      RAISE NOTICE 'PASS 1: non-commissioner refused';
  END;

  EXECUTE 'RESET ROLE';

  -- -------------------------------------------------------------------------
  -- 2. sync_matchups (as commissioner) writes matchups + espn_schedule_state.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_commissioner,
    'role', 'authenticated',
    'app_metadata', json_build_object('roles', json_build_array('commissioner'))
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_sync_result := public.sync_matchups(1999, 7, jsonb_build_array(
    jsonb_build_object(
      'espn_matchup_id', 1, 'week_number', 1, 'is_playoffs', false,
      'home_team_id', v_team_a, 'away_team_id', v_team_b,
      'home_score', 100.0, 'away_score', 90.0, 'winner', 'HOME'
    )
  ));
  IF NOT (SELECT bool_and((r->>'updated')::boolean) FROM jsonb_array_elements(v_sync_result) r) THEN
    RAISE EXCEPTION 'FAIL 2: sync_matchups did not report the row updated -- got %', v_sync_result;
  END IF;

  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_matchup_count FROM public.matchups WHERE season_year = 1999;
  IF v_matchup_count != 1 THEN
    RAISE EXCEPTION 'FAIL 2: expected 1 matchup row, found %', v_matchup_count;
  END IF;

  SELECT current_week INTO v_current_week FROM public.espn_schedule_state WHERE season_year = 1999;
  IF v_current_week != 7 THEN
    RAISE EXCEPTION 'FAIL 2: espn_schedule_state.current_week was %, expected 7', v_current_week;
  END IF;
  RAISE NOTICE 'PASS 2: sync_matchups wrote the matchup row and schedule state';

  -- -------------------------------------------------------------------------
  -- 3. Re-running with a changed score updates the existing row (ON CONFLICT path) rather
  --    than duplicating it -- the whole reason this is an UPSERT and not delete+reinsert.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_commissioner,
    'role', 'authenticated',
    'app_metadata', json_build_object('roles', json_build_array('commissioner'))
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  PERFORM public.sync_matchups(1999, 7, jsonb_build_array(
    jsonb_build_object(
      'espn_matchup_id', 1, 'week_number', 1, 'is_playoffs', false,
      'home_team_id', v_team_a, 'away_team_id', v_team_b,
      'home_score', 114.5, 'away_score', 90.0, 'winner', 'HOME'
    )
  ));

  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_matchup_count FROM public.matchups WHERE season_year = 1999;
  IF v_matchup_count != 1 THEN
    RAISE EXCEPTION 'FAIL 3: re-sync duplicated the row instead of updating it -- found % rows', v_matchup_count;
  END IF;

  SELECT home_score INTO v_home_score FROM public.matchups
    WHERE season_year = 1999 AND espn_matchup_id = 1;
  IF v_home_score != 114.5 THEN
    RAISE EXCEPTION 'FAIL 3: home_score was not updated to 114.5, got %', v_home_score;
  END IF;
  RAISE NOTICE 'PASS 3: re-sync updated the existing row in place (ON CONFLICT), no duplicate';

  -- -------------------------------------------------------------------------
  -- 4. Public (anon) can read matchups -- same public-read policy as teams/team_rosters.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '{}', true);
  EXECUTE 'SET LOCAL ROLE anon';

  SELECT count(*) INTO v_matchup_count FROM public.matchups WHERE season_year = 1999;
  IF v_matchup_count != 1 THEN
    RAISE EXCEPTION 'FAIL 4: anon could not read the matchups row';
  END IF;

  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'PASS 4: anon can read matchups via the public-read policy';

  RAISE NOTICE 'All 4 checks passed.';
END
$verify$;

ROLLBACK;
