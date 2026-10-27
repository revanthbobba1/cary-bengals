-- Verification for migration 049 (press_conferences schema + RLS).
-- Run after applying 049 (and 050, harmless either way), e.g.:
--   supabase db query --linked --file supabase/tests/verify_049.sql
-- Wrapped in BEGIN/ROLLBACK -- safe to run against a real project.
--
-- Same forged-JWT pattern as verify_028.sql: the SQL editor and `db query --linked` connect as
-- `postgres`, which bypasses RLS, so each test below sets `request.jwt.claims` and switches role
-- to exercise the exact policy checks a real request would hit. 010's postmortem is why every
-- role gets tested here, not just the commissioner.

BEGIN;

-- ---------------------------------------------------------------------------
-- Test 1: anon can read press conferences
-- ---------------------------------------------------------------------------

DO $anon_read$
DECLARE
  v_id uuid;
  v_count integer;
BEGIN
  -- Seed as postgres (RLS bypass).
  INSERT INTO public.press_conferences (season_year, week_number, title, youtube_url)
  VALUES (1999, 1, 'Verify Fixture', 'https://www.youtube.com/watch?v=verify049')
  RETURNING id INTO v_id;
  PERFORM set_config('test.pc_id', v_id::text, true);

  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  EXECUTE 'SET LOCAL ROLE anon';

  SELECT count(*) INTO v_count FROM public.press_conferences WHERE id = v_id;
  IF v_count != 1 THEN
    RAISE EXCEPTION 'FAIL: anon cannot see a press conference -- public SELECT policy is broken';
  END IF;

  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'PASS: anon can read press conferences';
END
$anon_read$;

-- ---------------------------------------------------------------------------
-- Test 2: a plain (non-commissioner) authenticated member cannot INSERT
-- ---------------------------------------------------------------------------

DO $member_insert$
DECLARE v_other uuid := gen_random_uuid();
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_other,
    'role', 'authenticated',
    'app_metadata', json_build_object('roles', json_build_array('admin'))
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    INSERT INTO public.press_conferences (season_year, week_number, title, youtube_url)
    VALUES (1999, 2, 'Should not exist', 'https://www.youtube.com/watch?v=shouldfail');
    RAISE EXCEPTION 'FAIL: a plain member CREATED a press conference -- commissioner gate is open';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS: plain member INSERT refused';
  END;

  EXECUTE 'RESET ROLE';
END
$member_insert$;

-- ---------------------------------------------------------------------------
-- Test 3: a plain member cannot UPDATE or DELETE an existing row
-- ---------------------------------------------------------------------------

DO $member_write$
DECLARE
  v_other uuid := gen_random_uuid();
  v_id uuid := current_setting('test.pc_id')::uuid;
  v_count integer;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_other,
    'role', 'authenticated',
    'app_metadata', json_build_object('roles', json_build_array('admin'))
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  UPDATE public.press_conferences SET title = 'Hijacked' WHERE id = v_id;
  IF FOUND THEN
    RAISE EXCEPTION 'FAIL: plain member was able to UPDATE a press conference';
  END IF;

  DELETE FROM public.press_conferences WHERE id = v_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count != 0 THEN
    RAISE EXCEPTION 'FAIL: plain member was able to DELETE a press conference';
  END IF;

  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'PASS: plain member UPDATE/DELETE both silently no-op under RLS';
END
$member_write$;

-- ---------------------------------------------------------------------------
-- Test 4: the youtube_url/spotify_url CHECK constraint rejects an entry with neither
-- ---------------------------------------------------------------------------

DO $both_null$
BEGIN
  -- As postgres (RLS bypass) -- this constraint applies regardless of role, so there's no need
  -- to forge a commissioner claim just to prove the CHECK itself works.
  BEGIN
    INSERT INTO public.press_conferences (season_year, week_number, title)
    VALUES (1999, 3, 'No links');
    RAISE EXCEPTION 'FAIL: inserted a press conference with neither youtube_url nor spotify_url set';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'PASS: CHECK constraint rejects an entry with no links';
  END;
END
$both_null$;

-- ---------------------------------------------------------------------------
-- Test 5: commissioner can INSERT, UPDATE, and DELETE
-- ---------------------------------------------------------------------------

DO $commissioner_write$
DECLARE
  v_commissioner uuid := gen_random_uuid();
  v_id uuid;
  v_count integer;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_commissioner,
    'role', 'authenticated',
    'app_metadata', json_build_object('roles', json_build_array('admin', 'commissioner'))
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO public.press_conferences (season_year, week_number, title, spotify_url)
  VALUES (1999, 4, 'Commissioner Fixture', 'https://open.spotify.com/episode/verify049')
  RETURNING id INTO v_id;

  UPDATE public.press_conferences SET title = 'Commissioner Fixture Edited' WHERE id = v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL: commissioner could not UPDATE their own insert';
  END IF;

  DELETE FROM public.press_conferences WHERE id = v_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count != 1 THEN
    RAISE EXCEPTION 'FAIL: commissioner could not DELETE';
  END IF;

  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'PASS: commissioner can INSERT, UPDATE, and DELETE';
END
$commissioner_write$;

-- ---------------------------------------------------------------------------
-- Test 6: RLS is actually enabled
-- ---------------------------------------------------------------------------

DO $rls_enabled$
DECLARE v_rls boolean;
BEGIN
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE relname = 'press_conferences';
  IF NOT v_rls THEN
    RAISE EXCEPTION 'FAIL: RLS not enabled on press_conferences';
  END IF;
  RAISE NOTICE 'PASS: RLS enabled on press_conferences';
END
$rls_enabled$;

ROLLBACK;
