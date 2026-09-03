-- 011/013 backfilled `roles: ["admin"]` onto every user that existed at the time, but nothing
-- applied that going forward -- every new invite since then keeps whatever raw shape Supabase
-- Auth writes by default (a singular `role` string, or nothing at all), so each new member is
-- silently invisible to every `roles`-array check in the app (e.g. get_poll_week_submission_status,
-- 017) until someone notices and hand-fixes their metadata. This is exactly what just happened to
-- the newest invite. Per the project's own design intent (README: "all league members get equal
-- /admin access"), every new signup should get `admin` automatically, not as a manual follow-up step.
--
-- BEFORE INSERT so the trigger can mutate NEW.raw_app_meta_data directly instead of a separate
-- UPDATE after the fact. Also promotes a legacy singular `role` string into the `roles` array if
-- that's what a given signup happens to carry, same normalization 011 did -- so this can't
-- reintroduce the exact bug it's meant to prevent.
CREATE OR REPLACE FUNCTION public.grant_default_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_roles jsonb;
BEGIN
  v_roles := COALESCE(
    NEW.raw_app_meta_data->'roles',
    CASE WHEN NEW.raw_app_meta_data ? 'role'
      THEN jsonb_build_array(NEW.raw_app_meta_data->>'role')
      ELSE '[]'::jsonb
    END
  );

  IF NOT (v_roles ? 'admin') THEN
    v_roles := v_roles || '["admin"]'::jsonb;
  END IF;

  NEW.raw_app_meta_data := COALESCE(NEW.raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('roles', v_roles);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_grant_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_admin
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_default_admin_role();

-- One-time backfill for the account that slipped through before this trigger existed: Sam
-- Nangali's account (created 2026-08-23) still has legacy `{"role": "member"}` metadata, which is
-- why he was invisible in the commissioner's submission-status view.
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object(
  'roles',
  COALESCE(raw_app_meta_data->'roles', jsonb_build_array(raw_app_meta_data->>'role')) || '["admin"]'::jsonb
)
WHERE id = '5e8c67b5-8fba-41e9-96d6-3d393babae73'
  AND NOT (COALESCE(raw_app_meta_data->'roles', '[]'::jsonb) ? 'admin');
