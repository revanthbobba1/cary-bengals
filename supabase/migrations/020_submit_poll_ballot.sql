-- Atomic ballot submission, closing the "deliberately not done" gap noted in
-- docs/POLL_SYSTEM_PLAN.md §3: PollSubmissionForm.tsx's submit flow was a
-- client-side delete-then-insert, so an insert failure for any reason other
-- than the already-handled "week closed mid-edit" case left the member with
-- no ballot at all (the old one already deleted, the new one never landed).
-- Wrapping both statements in one SECURITY DEFINER function makes them a
-- single transaction: a failed insert (bad data, a constraint violation, a
-- dropped connection) rolls back the delete too, so the member's prior
-- ballot is never lost to a failed resubmit.
--
-- SECURITY DEFINER bypasses RLS, so this function re-implements the same
-- access control the RLS policies (015) already enforce: submissions can
-- only be written for the calling user (auth.uid(), never a caller-supplied
-- id) while poll_week_is_open() is true.

CREATE FUNCTION public.submit_poll_ballot(p_poll_week_id uuid, p_rankings jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.poll_week_is_open(p_poll_week_id) THEN
    RAISE EXCEPTION 'This week is no longer open for submissions';
  END IF;

  DELETE FROM public.poll_submissions
  WHERE poll_week_id = p_poll_week_id AND user_id = v_user_id;

  INSERT INTO public.poll_submissions (poll_week_id, user_id, team_id, rank, team_record)
  SELECT
    p_poll_week_id,
    v_user_id,
    (elem->>'team_id')::uuid,
    (elem->>'rank')::integer,
    elem->>'team_record'
  FROM jsonb_array_elements(p_rankings) AS elem;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_poll_ballot(uuid, jsonb) TO authenticated;
