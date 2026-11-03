-- Verification for migration 054 (poll reminder columns, re-arm trigger, get_unsubmitted_voters).
-- Run after applying 054, e.g.:
--   supabase db query --linked --file supabase/tests/verify_054.sql
-- Wrapped in BEGIN/ROLLBACK -- safe to run against a real project. Each check RAISEs on failure,
-- so a clean run with no error means everything passed.
--
-- Same forged-JWT pattern as verify_049.sql: the SQL editor connects as `postgres`, which bypasses
-- grants, so the access checks switch role and set request.jwt.claims to behave like a real request.

BEGIN;

-- ---------------------------------------------------------------------------
-- Test 1: defaults, and the deadline-change trigger re-arms the reminder
-- ---------------------------------------------------------------------------

DO $rearm$
DECLARE
  v_id uuid;
  v_hours integer;
  v_sent timestamptz;
BEGIN
  INSERT INTO public.poll_weeks (season_year, week_number, deadline)
  VALUES (1999, 1, now() + interval '1 day')
  RETURNING id, reminder_hours_before, reminder_sent_at INTO v_id, v_hours, v_sent;
  PERFORM set_config('test.pw_id', v_id::text, true);

  IF v_hours <> 4 THEN RAISE EXCEPTION 'FAIL: reminder_hours_before default is %, expected 4', v_hours; END IF;
  IF v_sent IS NOT NULL THEN RAISE EXCEPTION 'FAIL: reminder_sent_at should start NULL'; END IF;

  -- Claiming the week (what the job does) must NOT be undone by the trigger.
  UPDATE public.poll_weeks SET reminder_sent_at = now() WHERE id = v_id;
  SELECT reminder_sent_at INTO v_sent FROM public.poll_weeks WHERE id = v_id;
  IF v_sent IS NULL THEN RAISE EXCEPTION 'FAIL: setting reminder_sent_at was cleared by the trigger'; END IF;

  -- Writing the SAME deadline back is not a change.
  UPDATE public.poll_weeks SET deadline = deadline WHERE id = v_id;
  SELECT reminder_sent_at INTO v_sent FROM public.poll_weeks WHERE id = v_id;
  IF v_sent IS NULL THEN RAISE EXCEPTION 'FAIL: an unchanged deadline cleared reminder_sent_at'; END IF;

  -- A real deadline change re-arms it.
  UPDATE public.poll_weeks SET deadline = deadline + interval '1 hour' WHERE id = v_id;
  SELECT reminder_sent_at INTO v_sent FROM public.poll_weeks WHERE id = v_id;
  IF v_sent IS NOT NULL THEN RAISE EXCEPTION 'FAIL: a changed deadline did not clear reminder_sent_at'; END IF;

  RAISE NOTICE 'PASS: defaults and re-arm trigger';
END;
$rearm$;

-- The CHECK constraint rejects out-of-range lead times.
DO $check$
BEGIN
  BEGIN
    UPDATE public.poll_weeks SET reminder_hours_before = 0
    WHERE id = current_setting('test.pw_id')::uuid;
    RAISE EXCEPTION 'FAIL: reminder_hours_before = 0 was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: reminder_hours_before CHECK rejects 0';
  END;
END;
$check$;

-- ---------------------------------------------------------------------------
-- Test 2: get_unsubmitted_voters is service_role only
-- ---------------------------------------------------------------------------

DO $access$
DECLARE
  v_id uuid := current_setting('test.pw_id')::uuid;
BEGIN
  -- authenticated (even a commissioner) must be refused: EXECUTE was revoked from PUBLIC.
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"roles":["admin","commissioner"]}}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM * FROM public.get_unsubmitted_voters(v_id);
    RAISE EXCEPTION 'FAIL: authenticated could call get_unsubmitted_voters';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: authenticated refused';
  END;
  EXECUTE 'RESET ROLE';

  -- anon likewise.
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM * FROM public.get_unsubmitted_voters(v_id);
    RAISE EXCEPTION 'FAIL: anon could call get_unsubmitted_voters';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon refused';
  END;
  EXECUTE 'RESET ROLE';

  -- service_role is allowed.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  EXECUTE 'SET LOCAL ROLE service_role';
  PERFORM * FROM public.get_unsubmitted_voters(v_id);
  RAISE NOTICE 'PASS: service_role allowed';
  EXECUTE 'RESET ROLE';
END;
$access$;

ROLLBACK;
