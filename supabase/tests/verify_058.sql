-- Verification for migration 058 (award_results + league_owner_awards view).
-- Run after applying 058, e.g.:
--   supabase db query --linked --file supabase/tests/verify_058.sql
-- Wrapped in BEGIN/ROLLBACK -- safe to run against a real project. Needs at least one row in
-- `teams` (borrows its id for the foreign key); every fixture row uses season 1999.
--
-- Same forged-JWT pattern as verify_049.sql: each test sets `request.jwt.claims` and switches role
-- so the real policy checks run, for every role rather than just the commissioner.

BEGIN;

-- ---------------------------------------------------------------------------
-- Test 1: anon can read award results
-- ---------------------------------------------------------------------------

DO $anon_read$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.award_results (season_year, week_number, award_id, team_id)
  SELECT 1999, 1, 'high-score', id FROM public.teams LIMIT 1;

  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  EXECUTE 'SET LOCAL ROLE anon';

  SELECT count(*) INTO v_count FROM public.award_results WHERE season_year = 1999;
  IF v_count != 1 THEN
    RAISE EXCEPTION 'FAIL: anon cannot see award results -- public SELECT policy is broken';
  END IF;

  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'PASS: anon can read award results';
END
$anon_read$;

-- ---------------------------------------------------------------------------
-- Test 2: a plain (non-commissioner) authenticated member cannot INSERT, UPDATE or DELETE
-- ---------------------------------------------------------------------------

DO $member_write$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', gen_random_uuid(),
    'role', 'authenticated',
    'app_metadata', json_build_object('roles', json_build_array('admin'))
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    INSERT INTO public.award_results (season_year, week_number, award_id, team_id)
    SELECT 1999, 2, 'low-score', id FROM public.teams LIMIT 1;
    RAISE EXCEPTION 'FAIL: a plain member INSERTED an award result -- commissioner gate is open';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS: plain member INSERT refused';
  END;

  UPDATE public.award_results SET award_id = 'hijacked' WHERE season_year = 1999;
  IF FOUND THEN
    RAISE EXCEPTION 'FAIL: plain member was able to UPDATE an award result';
  END IF;

  DELETE FROM public.award_results WHERE season_year = 1999;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'FAIL: plain member was able to DELETE an award result';
  END IF;

  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'PASS: plain member UPDATE/DELETE both silently no-op under RLS';
END
$member_write$;

-- ---------------------------------------------------------------------------
-- Test 3: commissioner can INSERT and DELETE
-- ---------------------------------------------------------------------------

DO $commissioner_write$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', gen_random_uuid(),
    'role', 'authenticated',
    'app_metadata', json_build_object('roles', json_build_array('admin', 'commissioner'))
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO public.award_results (season_year, week_number, award_id, team_id)
  SELECT 1999, 3, 'blowout', id FROM public.teams LIMIT 1;

  DELETE FROM public.award_results WHERE season_year = 1999 AND week_number = 3;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count != 1 THEN
    RAISE EXCEPTION 'FAIL: commissioner could not manage award results';
  END IF;

  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'PASS: commissioner can INSERT and DELETE award results';
END
$commissioner_write$;

-- ---------------------------------------------------------------------------
-- Test 4: the same award can't be stored twice for one week (single winner)
-- ---------------------------------------------------------------------------

DO $duplicate$
BEGIN
  BEGIN
    INSERT INTO public.award_results (season_year, week_number, award_id, team_id)
    SELECT 1999, 1, 'high-score', id FROM public.teams LIMIT 1;
    RAISE EXCEPTION 'FAIL: stored a second winner for the same award and week';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'PASS: primary key rejects a duplicate (season, week, award)';
  END;
END
$duplicate$;

ROLLBACK;
