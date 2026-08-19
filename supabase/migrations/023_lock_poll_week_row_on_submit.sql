-- Closes a narrow TOCTOU gap flagged by review: submit_poll_ballot (020/022)
-- checked poll_week_is_open() once, then ran DELETE/INSERT unconditionally
-- with no re-check at write time. Under READ COMMITTED, if the auto-lock
-- cron (019) or a commissioner's manual lock commits between the check and
-- the writes, the ballot write would still land against a now-locked week —
-- SECURITY DEFINER means RLS no longer backstops this either, since 021
-- dropped the member write policies entirely.
--
-- Fixed by locking the poll_weeks row (SELECT ... FOR UPDATE) instead of
-- calling the STABLE, non-locking poll_week_is_open() helper: this blocks
-- (or is blocked by) a concurrent lock/unlock on the same row for the
-- duration of the transaction, so the open/closed state read here can't go
-- stale before the DELETE/INSERT commit. Doesn't reuse poll_week_is_open()
-- for this one check, since that function's plain SELECT can't carry a
-- FOR UPDATE lock — every other caller (RLS policies) still uses it as-is.

CREATE OR REPLACE FUNCTION public.submit_poll_ballot(p_poll_week_id uuid, p_rankings jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_open boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT (is_locked = false AND deadline > now())
    INTO v_is_open
    FROM public.poll_weeks
    WHERE id = p_poll_week_id
    FOR UPDATE;

  IF v_is_open IS NOT TRUE THEN
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
