-- Issue #131 (see docs/POLL_REMINDERS_PLAN.md): email voters who haven't submitted a ballot a
-- reminder shortly before a poll week's deadline.
--
-- Adds the two columns the reminder job needs, a trigger that re-arms the reminder when the
-- deadline moves, and a service-role-only function listing who still owes a ballot.
--
-- Existing poll_weeks triggers/cron checked before writing this (per 036/037's postmortem, where
-- an undocumented trigger caused the bug): the only poll_weeks writer in the migrations is 019's
-- pg_cron auto-lock job, which sets is_locked and never touches deadline or these columns.
-- Worth re-checking against the live project (`SELECT tgname FROM pg_trigger WHERE tgrelid =
-- 'public.poll_weeks'::regclass AND NOT tgisinternal`) before applying, since the live database
-- is the source of truth, not this folder.

ALTER TABLE public.poll_weeks
  ADD COLUMN reminder_hours_before integer NOT NULL DEFAULT 4
    CONSTRAINT poll_weeks_reminder_hours_before_check CHECK (reminder_hours_before BETWEEN 1 AND 168),
  ADD COLUMN reminder_sent_at timestamptz;

COMMENT ON COLUMN public.poll_weeks.reminder_hours_before IS
  'How many hours before deadline the reminder email goes out (1-168).';
COMMENT ON COLUMN public.poll_weeks.reminder_sent_at IS
  'Set atomically by the reminder job when it claims this week, so overlapping runs cannot double-send. NULL = not yet sent. Cleared whenever deadline changes.';

-- A moved deadline (009 did this once) makes the previous reminder stale, so re-arm it. Fires only
-- on a real change to deadline; the reminder job itself only ever writes reminder_sent_at, which
-- does not match UPDATE OF deadline.
CREATE OR REPLACE FUNCTION public.reset_reminder_on_deadline_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.deadline IS DISTINCT FROM OLD.deadline THEN
    NEW.reminder_sent_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER poll_weeks_reset_reminder_on_deadline_change
  BEFORE UPDATE OF deadline ON public.poll_weeks
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_reminder_on_deadline_change();

-- Voters who still owe a full ballot for a week. Same population and "has submitted" rule as
-- get_poll_week_submission_status (018): admin-role auth users, submitted = one row per team in the
-- season. That function requires a commissioner JWT, which the scheduled job doesn't have, so this
-- is a separate service_role-only function instead of loosening that one. Users without an email
-- are skipped since there is nowhere to send to.
CREATE OR REPLACE FUNCTION public.get_unsubmitted_voters(p_poll_week_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_season_year integer;
  v_team_count bigint;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role access required';
  END IF;

  SELECT pw.season_year INTO v_season_year FROM public.poll_weeks pw WHERE pw.id = p_poll_week_id;
  -- Without this, an unknown week id leaves v_team_count at 0 and every admin user would count as
  -- unsubmitted. Fail loudly instead of returning a list that would email the whole league.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Poll week % not found', p_poll_week_id;
  END IF;
  SELECT count(*) INTO v_team_count FROM public.teams WHERE season_year = v_season_year;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    (u.raw_user_meta_data->>'full_name')::text
  FROM auth.users u
  LEFT JOIN public.poll_submissions ps
    ON ps.user_id = u.id AND ps.poll_week_id = p_poll_week_id
  WHERE (u.raw_app_meta_data->'roles')::jsonb ? 'admin'
    AND u.email IS NOT NULL
  GROUP BY u.id, u.email, u.raw_user_meta_data
  HAVING count(ps.id) < GREATEST(v_team_count, 1)
  ORDER BY u.email;
END;
$$;

REVOKE ALL ON FUNCTION public.get_unsubmitted_voters(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unsubmitted_voters(uuid) TO service_role;
