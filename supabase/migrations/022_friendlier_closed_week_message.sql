-- submit_poll_ballot's "week closed" message was being overridden client-side
-- in PollSubmissionForm.tsx (matching the exact RAISE EXCEPTION text and
-- swapping in a friendlier one) rather than just raising the friendlier
-- message in the first place — fragile (silently falls back to the raw,
-- less helpful text the moment the two copies drift) and harder to follow
-- than having one source of truth for this message. Replacing in place:
-- same signature/return shape, so CREATE OR REPLACE is sufficient, no need
-- to drop first.

CREATE OR REPLACE FUNCTION public.submit_poll_ballot(p_poll_week_id uuid, p_rankings jsonb)
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
    RAISE EXCEPTION 'This week closed while you were ranking. Refresh the page to see the current poll status.';
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
