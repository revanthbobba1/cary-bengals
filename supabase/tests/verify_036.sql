-- Verification for migration 036 (role-metadata normalization on invite).
-- Run after applying 036, e.g.:
--   supabase db query --linked --file supabase/tests/verify_036.sql
-- Wrapped in BEGIN/ROLLBACK so nothing persists -- safe to run against a real project. The fake
-- auth.users rows below are rolled back; no invite email is ever sent (this writes the table
-- directly rather than going through GoTrue).
--
-- Check 1 is the regression test for the actual bug: 026 gated a BEFORE INSERT trigger on
-- `invited_at`, which the invite flow only stamps on a *later* write, so the gate never matched and
-- every invited account since 2026-09-02 got no roles array at all.

BEGIN;

DO $verify$
DECLARE
  v_id uuid;
  v_meta jsonb;
  v_legacy_rows int;
BEGIN
  -- -------------------------------------------------------------------------
  -- 1. The real invite flow: INSERT without invited_at, stamped on a later UPDATE.
  --    This is the exact sequence that produced the broken rows on the 2026-09-15 invites.
  -- -------------------------------------------------------------------------
  v_id := gen_random_uuid();
  INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data)
  VALUES (v_id, 'authenticated', 'authenticated', 'verify036-invite@example.test',
          '{"role": "member", "provider": "email", "providers": ["email"]}'::jsonb);

  UPDATE auth.users SET invited_at = now() WHERE id = v_id;

  SELECT raw_app_meta_data INTO v_meta FROM auth.users WHERE id = v_id;
  IF NOT (v_meta->'roles' ? 'admin') THEN
    RAISE EXCEPTION 'FAIL 1: invited account did not get admin -- got %', v_meta;
  END IF;
  IF v_meta ? 'role' THEN
    RAISE EXCEPTION 'FAIL 1: legacy singular role key survived -- got %', v_meta;
  END IF;
  IF v_meta->'roles' ? 'member' THEN
    RAISE EXCEPTION 'FAIL 1: member role survived -- got %', v_meta;
  END IF;
  IF NOT (v_meta->>'provider' = 'email' AND v_meta->'providers' ? 'email') THEN
    RAISE EXCEPTION 'FAIL 1: GoTrue provider keys were clobbered -- got %', v_meta;
  END IF;
  RAISE NOTICE 'PASS 1: invite flow (insert then stamp invited_at) -> %', v_meta;

  -- -------------------------------------------------------------------------
  -- 2. Invited at INSERT time (the path 025 was written for) still works.
  -- -------------------------------------------------------------------------
  v_id := gen_random_uuid();
  INSERT INTO auth.users (id, aud, role, email, invited_at, raw_app_meta_data)
  VALUES (v_id, 'authenticated', 'authenticated', 'verify036-atinsert@example.test', now(),
          '{"provider": "email"}'::jsonb);

  SELECT raw_app_meta_data INTO v_meta FROM auth.users WHERE id = v_id;
  IF NOT (v_meta->'roles' ? 'admin') THEN
    RAISE EXCEPTION 'FAIL 2: admin not granted at insert -- got %', v_meta;
  END IF;
  RAISE NOTICE 'PASS 2: invited-at-insert -> %', v_meta;

  -- -------------------------------------------------------------------------
  -- 3. A later metadata write (Dashboard hand-edit, or GoTrue clobbering the column)
  --    gets normalized instead of silently reintroducing the broken shape.
  -- -------------------------------------------------------------------------
  UPDATE auth.users
  SET raw_app_meta_data = '{"role": "member", "provider": "email"}'::jsonb
  WHERE id = v_id;

  SELECT raw_app_meta_data INTO v_meta FROM auth.users WHERE id = v_id;
  IF NOT (v_meta->'roles' ? 'admin') OR v_meta ? 'role' THEN
    RAISE EXCEPTION 'FAIL 3: later metadata write was not normalized -- got %', v_meta;
  END IF;
  RAISE NOTICE 'PASS 3: later metadata write re-normalized -> %', v_meta;

  -- -------------------------------------------------------------------------
  -- 4. commissioner is additive and survives normalization (this is how you promote someone).
  -- -------------------------------------------------------------------------
  UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data || '{"roles": ["admin", "commissioner"]}'::jsonb
  WHERE id = v_id;

  SELECT raw_app_meta_data INTO v_meta FROM auth.users WHERE id = v_id;
  IF NOT (v_meta->'roles' ? 'commissioner' AND v_meta->'roles' ? 'admin') THEN
    RAISE EXCEPTION 'FAIL 4: commissioner did not survive -- got %', v_meta;
  END IF;
  RAISE NOTICE 'PASS 4: commissioner preserved -> %', v_meta;

  -- -------------------------------------------------------------------------
  -- 5. Invite-only still holds: a self-service signup (no invited_at) gets nothing.
  --    This is what 026 was trying to protect, enforced where it actually runs.
  -- -------------------------------------------------------------------------
  v_id := gen_random_uuid();
  INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data)
  VALUES (v_id, 'authenticated', 'authenticated', 'verify036-selfsignup@example.test',
          '{"provider": "google", "providers": ["google"]}'::jsonb);

  SELECT raw_app_meta_data INTO v_meta FROM auth.users WHERE id = v_id;
  IF v_meta ? 'roles' THEN
    RAISE EXCEPTION 'FAIL 5: uninvited signup was granted roles -- got %', v_meta;
  END IF;
  RAISE NOTICE 'PASS 5: uninvited signup untouched -> %', v_meta;

  -- -------------------------------------------------------------------------
  -- 6. Malformed `roles` values are repaired, not raised on. jsonb_array_elements() rejects a
  --    scalar or an object, and this function also backs the backfill UPDATE -- so without the
  --    type check in normalize_app_roles(), one hand-typed row like this would abort the whole
  --    migration. (Found in review of PR #77.)
  -- -------------------------------------------------------------------------
  v_id := gen_random_uuid();
  INSERT INTO auth.users (id, aud, role, email, invited_at, raw_app_meta_data)
  VALUES (v_id, 'authenticated', 'authenticated', 'verify036-stringroles@example.test', now(),
          '{"roles": "commissioner", "provider": "email"}'::jsonb);

  SELECT raw_app_meta_data INTO v_meta FROM auth.users WHERE id = v_id;
  IF jsonb_typeof(v_meta->'roles') <> 'array' THEN
    RAISE EXCEPTION 'FAIL 6: string roles was not promoted to an array -- got %', v_meta;
  END IF;
  IF NOT (v_meta->'roles' ? 'admin' AND v_meta->'roles' ? 'commissioner') THEN
    RAISE EXCEPTION 'FAIL 6: string roles lost its value or missed the admin grant -- got %', v_meta;
  END IF;
  RAISE NOTICE 'PASS 6: string roles promoted -> %', v_meta;

  -- An object is unreadable rather than misspelled, so it's discarded and rebuilt, not promoted.
  UPDATE auth.users
  SET raw_app_meta_data = '{"roles": {"admin": true}, "provider": "email"}'::jsonb
  WHERE id = v_id;

  SELECT raw_app_meta_data INTO v_meta FROM auth.users WHERE id = v_id;
  IF v_meta->'roles' <> '["admin"]'::jsonb THEN
    RAISE EXCEPTION 'FAIL 6: object roles was not rebuilt as ["admin"] -- got %', v_meta;
  END IF;
  RAISE NOTICE 'PASS 6: object roles rebuilt -> %', v_meta;

  -- -------------------------------------------------------------------------
  -- 7. Backfill: no real account is left in a legacy shape.
  -- -------------------------------------------------------------------------
  SELECT count(*) INTO v_legacy_rows
  FROM auth.users
  WHERE raw_app_meta_data ? 'role'
     OR COALESCE(raw_app_meta_data->'roles', '[]'::jsonb) ? 'member'
     OR (invited_at IS NOT NULL AND NOT (COALESCE(raw_app_meta_data->'roles', '[]'::jsonb) ? 'admin'));
  IF v_legacy_rows > 0 THEN
    RAISE EXCEPTION 'FAIL 7: % account(s) still in a legacy role shape', v_legacy_rows;
  END IF;
  RAISE NOTICE 'PASS 7: every account has a clean roles array';

  RAISE NOTICE 'All 7 checks passed.';
END
$verify$;

ROLLBACK;
