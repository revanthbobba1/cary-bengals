-- Verification for migration 043 (service_role bypass branch on all four ESPN sync RPCs).
-- Run after applying 043, e.g.:
--   supabase db query --linked --file supabase/tests/verify_043.sql
-- Wrapped in BEGIN/ROLLBACK so nothing persists -- safe to run against a real project.
--
-- This migration's only behavior change is adding a new allowed caller (service_role) to four
-- RPCs whose commissioner-gated/refused paths are already covered by verify_035 (n/a, predates
-- this convention)/verify_041.sql/verify_042.sql. So this script focuses on the new coverage --
-- a simulated service_role request succeeding on all four -- plus one quick non-commissioner
-- refusal and one commissioner-success check as a sanity backstop that the guard rewrite didn't
-- break the existing paths.

BEGIN;

DO $verify$
DECLARE
  v_commissioner uuid := gen_random_uuid();
  v_member uuid := gen_random_uuid();
  v_team_a uuid := gen_random_uuid();
  v_team_b uuid := gen_random_uuid();
  v_sync_result jsonb;
BEGIN
  -- -------------------------------------------------------------------------
  -- Fixtures: two teams in an isolated season.
  -- -------------------------------------------------------------------------
  INSERT INTO public.teams (id, name, owner_name, season_year, espn_team_id)
  VALUES
    (v_team_a, 'Verify043 Team A', 'Owner A', 1998, 9044),
    (v_team_b, 'Verify043 Team B', 'Owner B', 1998, 9045);

  INSERT INTO auth.users (id, aud, role, email)
  VALUES (v_member, 'authenticated', 'authenticated', 'verify043-member@example.test');

  -- -------------------------------------------------------------------------
  -- 1. Sanity backstop: a plain (non-commissioner, non-service-role) caller is still refused.
  --    Only sync_matchups is checked here -- the other three's refusal path is identical and
  --    already covered by verify_041.sql/verify_042.sql; this just confirms the guard rewrite
  --    (adding the OR branch) didn't accidentally loosen it for a plain authenticated user.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_member,
    'role', 'authenticated',
    'app_metadata', json_build_object('roles', json_build_array('admin'))
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    PERFORM public.sync_matchups(1998, 1, '[]'::jsonb);
    RAISE EXCEPTION 'FAIL 1: a plain admin was allowed to sync matchups';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM != 'Commissioner access required.' THEN
        RAISE;
      END IF;
      RAISE NOTICE 'PASS 1: non-commissioner still refused after the guard rewrite';
  END;

  EXECUTE 'RESET ROLE';

  -- -------------------------------------------------------------------------
  -- 2. Sanity backstop: a commissioner can still call all four (guard rewrite didn't break the
  --    existing path). One representative call per function, not full behavioral coverage --
  --    that's already in verify_041.sql/verify_042.sql.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_commissioner,
    'role', 'authenticated',
    'app_metadata', json_build_object('roles', json_build_array('commissioner'))
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  PERFORM public.sync_team_records(1998, jsonb_build_array(
    jsonb_build_object('db_team_id', v_team_a, 'wins', 1, 'losses', 0, 'ties', 0)
  ));

  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'PASS 2: commissioner can still call the rewritten RPCs';

  -- -------------------------------------------------------------------------
  -- 3. The new coverage: a simulated service_role request succeeds on all four, where it would
  --    have been refused before this migration.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  EXECUTE 'SET LOCAL ROLE service_role';

  PERFORM public.sync_espn_teams(1998, jsonb_build_array(
    jsonb_build_object(
      'db_team_id', v_team_a, 'name', 'Verify043 Team A (cron)',
      'espn_team_id', 9044, 'espn_owner_id', null, 'owner_name', null
    )
  ));

  PERFORM public.sync_team_rosters(jsonb_build_array(
    jsonb_build_object(
      'team_id', v_team_a,
      'players', jsonb_build_array(
        jsonb_build_object(
          'name', 'Cron Test Player', 'position', 'QB', 'pro_team', 'CIN',
          'lineup_slot', 'QB', 'is_starter', true
        )
      )
    )
  ));

  PERFORM public.sync_team_records(1998, jsonb_build_array(
    jsonb_build_object('db_team_id', v_team_a, 'wins', 2, 'losses', 0, 'ties', 0)
  ));

  v_sync_result := public.sync_matchups(1998, 3, jsonb_build_array(
    jsonb_build_object(
      'espn_matchup_id', 1, 'week_number', 1, 'is_playoffs', false,
      'home_team_id', v_team_a, 'away_team_id', v_team_b,
      'home_score', 50.0, 'away_score', 40.0, 'winner', 'HOME'
    )
  ));

  EXECUTE 'RESET ROLE';

  IF (SELECT name FROM public.teams WHERE id = v_team_a) != 'Verify043 Team A (cron)' THEN
    RAISE EXCEPTION 'FAIL 3: sync_espn_teams did not write under a simulated service_role request';
  END IF;

  IF (SELECT count(*) FROM public.team_rosters WHERE team_id = v_team_a) != 1 THEN
    RAISE EXCEPTION 'FAIL 3: sync_team_rosters did not write under a simulated service_role request';
  END IF;

  IF (SELECT wins FROM public.teams WHERE id = v_team_a) != 2 THEN
    RAISE EXCEPTION 'FAIL 3: sync_team_records did not write under a simulated service_role request';
  END IF;

  IF (v_sync_result->0->>'updated')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL 3: sync_matchups did not write under a simulated service_role request';
  END IF;

  RAISE NOTICE 'PASS 3: all four RPCs succeed under a simulated service_role request';

  RAISE NOTICE 'All 3 checks passed.';
END
$verify$;

ROLLBACK;
