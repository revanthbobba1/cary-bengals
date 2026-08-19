-- Add full_name to the submission-status function, so the UI can apply the same
-- "real name, then email local-part, then a fallback" display logic already used
-- for the page's own welcome message, instead of always showing the raw email.
--
-- Postgres won't let CREATE OR REPLACE change a function's RETURNS TABLE shape, so
-- this drops and recreates rather than replacing 017 in place (which is also
-- already applied to production — editing that file's contents wouldn't change
-- what's live, only a new migration does).

DROP FUNCTION IF EXISTS public.get_poll_week_submission_status(uuid);

CREATE FUNCTION public.get_poll_week_submission_status(p_poll_week_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  submission_count bigint,
  has_submitted boolean,
  submitted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_season_year integer;
  v_team_count bigint;
BEGIN
  IF NOT public.jwt_has_role('commissioner') THEN
    RAISE EXCEPTION 'Commissioner access required';
  END IF;

  SELECT pw.season_year INTO v_season_year FROM public.poll_weeks pw WHERE pw.id = p_poll_week_id;
  SELECT count(*) INTO v_team_count FROM public.teams WHERE season_year = v_season_year;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    (u.raw_user_meta_data->>'full_name')::text AS full_name,
    count(ps.id) AS submission_count,
    count(ps.id) >= GREATEST(v_team_count, 1) AS has_submitted,
    min(ps.submitted_at) AS submitted_at
  FROM auth.users u
  LEFT JOIN public.poll_submissions ps
    ON ps.user_id = u.id AND ps.poll_week_id = p_poll_week_id
  WHERE (u.raw_app_meta_data->'roles')::jsonb ? 'admin'
  GROUP BY u.id, u.email, u.raw_user_meta_data
  ORDER BY u.email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_poll_week_submission_status(uuid) TO authenticated;
