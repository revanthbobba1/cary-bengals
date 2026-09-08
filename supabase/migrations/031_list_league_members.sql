-- Previews & recaps, phase 3a — see docs/PREVIEWS_RECAPS_PLAN.md.
--
-- The commissioner's "assign an article" form needs a dropdown of league members. auth.users
-- isn't exposed to PostgREST, so this follows the exact precedent of
-- get_poll_week_submission_status() (017 + 018): a SECURITY DEFINER function, commissioner-gated
-- internally, rather than a service-role-key Route Handler (this app has no such runtime secret
-- today and 017's comment already made the case for keeping it that way).
CREATE OR REPLACE FUNCTION public.list_league_members()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.jwt_has_role('commissioner') THEN
    RAISE EXCEPTION 'Commissioner access required';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    (u.raw_user_meta_data->>'full_name')::text AS full_name
  FROM auth.users u
  -- "League member" = has the admin role, matching 017/018's identical definition.
  WHERE (u.raw_app_meta_data->'roles')::jsonb ? 'admin'
  ORDER BY u.email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_league_members() TO authenticated;
