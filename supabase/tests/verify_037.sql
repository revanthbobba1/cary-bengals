-- Verification for migration 037 (drop the undocumented set_default_role trigger).
-- Run after applying 037, e.g.:
--   supabase db query --linked --file supabase/tests/verify_037.sql
-- Wrapped in BEGIN/ROLLBACK so nothing persists -- safe to run against a real project.

BEGIN;

DO $verify$
DECLARE
  v_id uuid;
  v_meta jsonb;
  v_count int;
BEGIN
  -- 1. The trigger and its function are gone.
  SELECT count(*) INTO v_count
  FROM pg_trigger
  WHERE tgrelid = 'auth.users'::regclass AND tgname = 'on_auth_user_created';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'FAIL 1: on_auth_user_created still exists on auth.users';
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'set_default_role';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'FAIL 1: public.set_default_role() still exists';
  END IF;
  RAISE NOTICE 'PASS 1: trigger and function dropped';

  -- 2. A fresh insert is no longer stamped. This is the assertion that would have caught the
  --    trigger years earlier: insert without a `role` key, expect it to stay absent.
  v_id := gen_random_uuid();
  INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data)
  VALUES (v_id, 'authenticated', 'authenticated', 'verify037-signup@example.test',
          '{"provider": "google", "providers": ["google"]}'::jsonb);

  SELECT raw_app_meta_data INTO v_meta FROM auth.users WHERE id = v_id;
  IF v_meta ? 'role' THEN
    RAISE EXCEPTION 'FAIL 2: something still stamps a legacy role key -- got %', v_meta;
  END IF;
  RAISE NOTICE 'PASS 2: uninvited insert not stamped -> %', v_meta;

  -- 3. An invited insert still gets admin -- 036's trigger is untouched by this migration.
  v_id := gen_random_uuid();
  INSERT INTO auth.users (id, aud, role, email, invited_at, raw_app_meta_data)
  VALUES (v_id, 'authenticated', 'authenticated', 'verify037-invite@example.test', now(),
          '{"provider": "email"}'::jsonb);

  SELECT raw_app_meta_data INTO v_meta FROM auth.users WHERE id = v_id;
  IF NOT (v_meta->'roles' ? 'admin') THEN
    RAISE EXCEPTION 'FAIL 3: 036 auto-grant regressed -- got %', v_meta;
  END IF;
  RAISE NOTICE 'PASS 3: invited insert still granted admin -> %', v_meta;

  -- 4. No account anywhere carries the legacy key.
  SELECT count(*) INTO v_count FROM auth.users WHERE raw_app_meta_data ? 'role';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'FAIL 4: % account(s) still carry a legacy role key', v_count;
  END IF;
  RAISE NOTICE 'PASS 4: no account carries a legacy role key';

  RAISE NOTICE 'All 4 checks passed.';
END
$verify$;

ROLLBACK;
