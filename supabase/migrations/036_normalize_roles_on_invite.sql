-- 026 broke the auto-grant it was meant to secure, and it has been broken for every invite since
-- it landed (2026-09-02).
--
-- 025 put a BEFORE INSERT trigger on auth.users to give every new account `roles: ["admin"]`.
-- 026 then gated that trigger on `WHEN (NEW.invited_at IS NOT NULL)` to enforce invite-only at the
-- database level. The gate never matches: the invite flow inserts the row first and stamps
-- `invited_at` in a separate write ~18ms later, so at INSERT time `invited_at` is still NULL. The
-- trigger has silently skipped every invited account since. Confirmed on the 2026-09-15 invite,
-- whose raw_app_meta_data is `{"role": "member", "provider": "email", "providers": ["email"]}` --
-- no `roles` array at all, despite a non-null `invited_at`.
--
-- Consequences for the affected accounts: no `roles` array means every jwt_has_role() check fails
-- and `(raw_app_meta_data->'roles') ? 'admin'` filters skip them, so they can't reach /admin and
-- are invisible in the commissioner's ballot-status view (017/018) and the article-assignment
-- member list (031).
--
-- The `{"role": "member"}` shape is separate rot with the same blast radius: `member` was dropped
-- as a concept in 014 and is read nowhere in the codebase, and the singular `role` key was dropped
-- in 012. Both of those were one-time UPDATEs over the rows that existed that day -- they fixed
-- data, they didn't constrain anything, so hand-typing the old shape into the Dashboard's App
-- Metadata box reintroduces it freely. (Note: unrelated to auth.users' own `role` COLUMN, which
-- GoTrue sets to 'authenticated'.)
--
-- Fix, in three parts:
--   1. Move the invite-only gate off the trigger's WHEN clause and into the function body, where
--      it reads `invited_at` at the time it actually runs rather than at INSERT time.
--   2. Also fire on UPDATE. This is what makes the invite flow work (the row becomes invited on a
--      later write) and it's also the only thing that makes the shape stick: a Dashboard metadata
--      edit or a GoTrue write that clobbers raw_app_meta_data gets normalized on the way in.
--   3. Backfill, reusing the same function so the rules can't drift between the two paths.

-- Single source of truth for role-metadata shape. Kept separate from the trigger so the backfill
-- below applies byte-identical rules -- 011/013/014 each rewrote this logic by hand and drifted.
CREATE OR REPLACE FUNCTION public.normalize_app_roles(p_meta jsonb, p_invited boolean)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_meta jsonb := COALESCE(p_meta, '{}'::jsonb);
  v_roles jsonb;
BEGIN
  -- Promote the legacy singular `role` string into the array, same normalization 011 and 025 did.
  v_roles := COALESCE(
    v_meta->'roles',
    CASE WHEN v_meta ? 'role'
      THEN jsonb_build_array(v_meta->>'role')
      ELSE '[]'::jsonb
    END
  );

  -- Strip 'member' (dropped in 014 -- never checked anywhere, functionally identical to 'admin').
  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb)
  INTO v_roles
  FROM jsonb_array_elements(v_roles) r
  WHERE r <> '"member"'::jsonb;

  -- Leave a self-service signup's metadata completely untouched, rather than stamping an empty
  -- `roles: []` onto it. 026's invite-only intent, enforced where it actually works this time:
  -- an account with no invite never gets 'admin', whatever the project's signup setting says.
  IF NOT p_invited AND v_roles = '[]'::jsonb THEN
    RETURN v_meta;
  END IF;

  IF p_invited AND NOT (v_roles ? 'admin') THEN
    v_roles := v_roles || '["admin"]'::jsonb;
  END IF;

  RETURN (v_meta - 'role') || jsonb_build_object('roles', v_roles);
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_default_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.raw_app_meta_data := public.normalize_app_roles(
    NEW.raw_app_meta_data,
    NEW.invited_at IS NOT NULL
  );
  RETURN NEW;
END;
$$;

-- No WHEN clause this time: at INSERT the row usually isn't stamped as invited yet, so gating here
-- is exactly the bug. The function checks invited_at itself.
DROP TRIGGER IF EXISTS on_auth_user_created_grant_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_admin
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_default_admin_role();

-- `OF raw_app_meta_data, invited_at` keeps this off the hot path: an ordinary sign-in touches
-- last_sign_in_at only and won't fire it. BEFORE + assigning to NEW means no recursion.
DROP TRIGGER IF EXISTS on_auth_user_metadata_normalize_roles ON auth.users;
CREATE TRIGGER on_auth_user_metadata_normalize_roles
  BEFORE UPDATE OF raw_app_meta_data, invited_at ON auth.users
  FOR EACH ROW
  WHEN (
    NEW.raw_app_meta_data IS DISTINCT FROM OLD.raw_app_meta_data
    OR NEW.invited_at IS DISTINCT FROM OLD.invited_at
  )
  EXECUTE FUNCTION public.grant_default_admin_role();

-- Backfill every account the broken gate skipped (and any leftover `role`/'member' rot). Idempotent
-- by construction: normalize_app_roles() is a no-op on already-clean metadata, and the WHERE clause
-- means re-running this touches nothing.
UPDATE auth.users
SET raw_app_meta_data = public.normalize_app_roles(raw_app_meta_data, invited_at IS NOT NULL)
WHERE raw_app_meta_data IS DISTINCT FROM
      public.normalize_app_roles(raw_app_meta_data, invited_at IS NOT NULL);

-- NOTE: affected members must sign out and back in. app_metadata reaches RLS and the SECURITY
-- DEFINER RPCs through the JWT (jwt_has_role(), 010), and their current token still carries the old
-- claims until it refreshes -- up to ~1hr, or immediately on a fresh sign-in.
