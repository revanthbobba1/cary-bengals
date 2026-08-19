-- Admin-facing "who has/hasn't submitted" view. auth.users isn't exposed to PostgREST, so a
-- regular RLS-gated SELECT can't cross-reference it. Two ways to bridge that: a Route Handler
-- using the service role key, or a SECURITY DEFINER Postgres function callable via the normal
-- anon-key client. Going with the latter — it avoids introducing a permanent service-role-key
-- runtime secret (the app has none today; the key was previously only used for the one-time data
-- migration script) and matches the pattern already established here (jwt_has_role(),
-- poll_week_is_open()) of pushing access-control logic into Postgres rather than the app server.
--
-- SET search_path = '' + fully-qualified references throughout is the Supabase-recommended
-- hardening for SECURITY DEFINER functions (prevents search_path hijacking).

CREATE OR REPLACE FUNCTION public.get_poll_week_submission_status(p_poll_week_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
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
  -- The function itself is the access-control boundary — GRANT EXECUTE below only controls who
  -- can *call* it, not who gets real data back.
  IF NOT public.jwt_has_role('commissioner') THEN
    RAISE EXCEPTION 'Commissioner access required';
  END IF;

  SELECT pw.season_year INTO v_season_year FROM public.poll_weeks pw WHERE pw.id = p_poll_week_id;
  SELECT count(*) INTO v_team_count FROM public.teams WHERE season_year = v_season_year;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    count(ps.id) AS submission_count,
    -- Compares against the season's actual team count rather than a hardcoded 12, unlike a
    -- couple of older call sites in this codebase (app/admin/page.tsx) that still do that.
    count(ps.id) >= GREATEST(v_team_count, 1) AS has_submitted,
    min(ps.submitted_at) AS submitted_at
  FROM auth.users u
  LEFT JOIN public.poll_submissions ps
    ON ps.user_id = u.id AND ps.poll_week_id = p_poll_week_id
  -- "League member" = has the admin role, matching the role model everywhere else in this app.
  WHERE (u.raw_app_meta_data->'roles')::jsonb ? 'admin'
  GROUP BY u.id, u.email
  ORDER BY u.email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_poll_week_submission_status(uuid) TO authenticated;
