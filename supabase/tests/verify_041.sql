-- Verification for migration 041 (real ESPN team records replacing fake poll_results.team_record).
-- Run after applying 041, e.g.:
--   supabase db query --linked --file supabase/tests/verify_041.sql
-- Wrapped in BEGIN/ROLLBACK so nothing persists -- safe to run against a real project. Uses
-- set_config('request.jwt.claims', ...) + SET LOCAL ROLE to exercise the exact same code paths
-- jwt_has_role() and auth.uid() read in production, same pattern as verify_028.sql.
--
-- This migration touches the live weekly poll-submission RPC and finalize trigger, so the checks
-- below exercise the full real path -- sync_team_records writing to teams, submit_poll_ballot
-- with no team_record field at all, and recalculate_poll_results reading the record back off
-- teams -- rather than just confirming the schema change in isolation.

BEGIN;

DO $verify$
DECLARE
  v_commissioner uuid := gen_random_uuid();
  v_member1 uuid := gen_random_uuid();
  v_member2 uuid := gen_random_uuid();
  v_team_a uuid := gen_random_uuid();
  v_team_b uuid := gen_random_uuid();
  v_week_id uuid;
  v_sync_result jsonb;
  v_record_a text;
  v_record_b text;
  v_avg_a numeric;
  v_col_count integer;
BEGIN
  -- -------------------------------------------------------------------------
  -- Fixtures: two teams in an isolated season, two member accounts.
  -- -------------------------------------------------------------------------
  INSERT INTO public.teams (id, name, owner_name, season_year, espn_team_id)
  VALUES
    (v_team_a, 'Verify041 Team A', 'Owner A', 1999, 9041),
    (v_team_b, 'Verify041 Team B', 'Owner B', 1999, 9042);

  IF EXISTS (SELECT 1 FROM public.teams WHERE id IN (v_team_a, v_team_b) AND (wins != 0 OR losses != 0 OR ties != 0)) THEN
    RAISE EXCEPTION 'FAIL: new teams did not default wins/losses/ties to 0';
  END IF;

  INSERT INTO auth.users (id, aud, role, email)
  VALUES
    (v_member1, 'authenticated', 'authenticated', 'verify041-member1@example.test'),
    (v_member2, 'authenticated', 'authenticated', 'verify041-member2@example.test');

  -- -------------------------------------------------------------------------
  -- 1. sync_team_records refuses a non-commissioner.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_member1,
    'role', 'authenticated',
    'app_metadata', json_build_object('roles', json_build_array('admin'))
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    PERFORM public.sync_team_records(1999, jsonb_build_array(
      jsonb_build_object('db_team_id', v_team_a, 'wins', 1, 'losses', 0, 'ties', 0)
    ));
    RAISE EXCEPTION 'FAIL 1: a plain admin was allowed to sync team records';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM != 'Commissioner access required.' THEN
        RAISE;
      END IF;
      RAISE NOTICE 'PASS 1: non-commissioner refused';
  END;

  EXECUTE 'RESET ROLE';

  -- -------------------------------------------------------------------------
  -- 2. sync_team_records (as commissioner) writes wins/losses/ties, and only for the
  --    requested season -- same season-scoping sync_espn_teams (035) relies on.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_commissioner,
    'role', 'authenticated',
    'app_metadata', json_build_object('roles', json_build_array('commissioner'))
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_sync_result := public.sync_team_records(1999, jsonb_build_array(
    jsonb_build_object('db_team_id', v_team_a, 'wins', 10, 'losses', 2, 'ties', 0),
    jsonb_build_object('db_team_id', v_team_b, 'wins', 5, 'losses', 5, 'ties', 2)
  ));
  IF NOT (SELECT bool_and((r->>'updated')::boolean) FROM jsonb_array_elements(v_sync_result) r) THEN
    RAISE EXCEPTION 'FAIL 2: sync_team_records did not report both rows updated -- got %', v_sync_result;
  END IF;

  -- Wrong season_year in the call must not touch the row (mirrors 035's behavior).
  v_sync_result := public.sync_team_records(2000, jsonb_build_array(
    jsonb_build_object('db_team_id', v_team_a, 'wins', 99, 'losses', 99, 'ties', 99)
  ));
  IF (v_sync_result->0->>'updated')::boolean THEN
    RAISE EXCEPTION 'FAIL 2: sync_team_records updated a row under the wrong season_year';
  END IF;

  EXECUTE 'RESET ROLE';

  IF (SELECT (wins, losses, ties) FROM public.teams WHERE id = v_team_a) IS DISTINCT FROM (10, 2, 0) THEN
    RAISE EXCEPTION 'FAIL 2: team A record was not written as 10-2-0';
  END IF;
  IF (SELECT (wins, losses, ties) FROM public.teams WHERE id = v_team_b) IS DISTINCT FROM (5, 5, 2) THEN
    RAISE EXCEPTION 'FAIL 2: team B record was not written as 5-5-2';
  END IF;
  RAISE NOTICE 'PASS 2: sync_team_records wrote the right rows, scoped to the right season';

  -- -------------------------------------------------------------------------
  -- 3. poll_submissions.team_record is really gone (column drop took).
  -- -------------------------------------------------------------------------
  SELECT count(*) INTO v_col_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'poll_submissions' AND column_name = 'team_record';
  IF v_col_count != 0 THEN
    RAISE EXCEPTION 'FAIL 3: poll_submissions.team_record still exists';
  END IF;
  RAISE NOTICE 'PASS 3: poll_submissions.team_record column is gone';

  -- -------------------------------------------------------------------------
  -- 4. submit_poll_ballot works with no team_record field at all.
  -- -------------------------------------------------------------------------
  INSERT INTO public.poll_weeks (id, season_year, week_number, deadline, is_locked)
  VALUES (gen_random_uuid(), 1999, 1, now() + interval '1 day', false)
  RETURNING id INTO v_week_id;

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_member1, 'role', 'authenticated', 'app_metadata', json_build_object('roles', '[]'::json)
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.submit_poll_ballot(v_week_id, jsonb_build_array(
    jsonb_build_object('team_id', v_team_a, 'rank', 1),
    jsonb_build_object('team_id', v_team_b, 'rank', 2)
  ));
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_member2, 'role', 'authenticated', 'app_metadata', json_build_object('roles', '[]'::json)
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.submit_poll_ballot(v_week_id, jsonb_build_array(
    jsonb_build_object('team_id', v_team_a, 'rank', 2),
    jsonb_build_object('team_id', v_team_b, 'rank', 1)
  ));
  EXECUTE 'RESET ROLE';

  IF (SELECT count(*) FROM public.poll_submissions WHERE poll_week_id = v_week_id) != 4 THEN
    RAISE EXCEPTION 'FAIL 4: both ballots (2 teams each) did not land';
  END IF;
  RAISE NOTICE 'PASS 4: submit_poll_ballot succeeded with no team_record field';

  -- -------------------------------------------------------------------------
  -- 5. recalculate_poll_results sources team_record from teams.wins/losses/ties, not from
  --    anything in poll_submissions (which no longer has a team_record column to aggregate).
  -- -------------------------------------------------------------------------
  PERFORM public.recalculate_poll_results(v_week_id);

  SELECT team_record, avg_rank_score INTO v_record_a, v_avg_a
  FROM public.poll_results WHERE poll_week_id = v_week_id AND team_id = v_team_a;
  SELECT team_record INTO v_record_b
  FROM public.poll_results WHERE poll_week_id = v_week_id AND team_id = v_team_b;

  IF v_record_a != '10-2' THEN
    RAISE EXCEPTION 'FAIL 5: team A''s poll_results.team_record was ''%'', expected ''10-2''', v_record_a;
  END IF;
  IF v_record_b != '5-5-2' THEN
    RAISE EXCEPTION 'FAIL 5: team B''s poll_results.team_record was ''%'', expected ''5-5-2'' (ties omitted when > 0?)', v_record_b;
  END IF;
  IF v_avg_a != 1.5 THEN
    RAISE EXCEPTION 'FAIL 5: team A''s avg_rank_score was %, expected 1.5 (ranked 1 and 2)', v_avg_a;
  END IF;
  RAISE NOTICE 'PASS 5: poll_results.team_record (10-2 / 5-5-2) came straight from teams, trend math unaffected';

  RAISE NOTICE 'All 5 checks passed.';
END
$verify$;

ROLLBACK;
