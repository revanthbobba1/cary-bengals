-- poll_submissions.rank had a hardcoded `CHECK (rank >= 1 AND rank <= 12)` from 001, tied to the
-- 12-team roster seeded in 005. Adding a 13th team (a new league member) means a complete ballot
-- now includes rank 13, which the old constraint rejected outright — submit_poll_ballot's INSERT
-- failed the CHECK, the whole transaction rolled back, and every member's submission started
-- failing with no useful error message.
--
-- A column CHECK constraint can't reference another table's row count, so it can never track the
-- real team count going forward without being hand-edited every time the roster changes size —
-- exactly what just broke. Instead: relax the constraint to a generous static sanity bound (catches
-- genuinely bogus data like rank 99999, not a real business rule), and move the actual "matches
-- this season's real team count" validation into submit_poll_ballot itself (below), which can query
-- the teams table and give a clear, actionable error instead of a raw constraint violation.
--
-- Drops whatever the existing rank CHECK constraint is actually named rather than assuming
-- Postgres's default auto-generated name (poll_submissions_rank_check) — safer for a migration
-- being applied without a chance to confirm the live schema first.
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.poll_submissions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%rank%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.poll_submissions DROP CONSTRAINT %I', v_constraint_name);
  END IF;

  ALTER TABLE public.poll_submissions ADD CONSTRAINT poll_submissions_rank_check CHECK (rank >= 1 AND rank <= 100);
END $$;

-- CREATE OR REPLACE on submit_poll_ballot (020/022/023) to add the real "matches this season's
-- team count" validation. Preserves 023's row-lock fix exactly as-is (same single locked SELECT
-- for is_open, not a separate call to the non-locking poll_week_is_open() helper — see 023's own
-- comment for why that distinction matters) and just also reads season_year off that same locked
-- row so the team-count check below uses a consistent snapshot.
CREATE OR REPLACE FUNCTION public.submit_poll_ballot(p_poll_week_id uuid, p_rankings jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_open boolean;
  v_season_year integer;
  v_team_count integer;
  v_submitted_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT (is_locked = false AND deadline > now()), season_year
    INTO v_is_open, v_season_year
    FROM public.poll_weeks
    WHERE id = p_poll_week_id
    FOR UPDATE;

  IF v_is_open IS NOT TRUE THEN
    RAISE EXCEPTION 'This week closed while you were ranking. Refresh the page to see the current poll status.';
  END IF;

  SELECT count(*) INTO v_team_count FROM public.teams WHERE season_year = v_season_year;
  v_submitted_count := jsonb_array_length(p_rankings);
  IF v_submitted_count != v_team_count THEN
    RAISE EXCEPTION 'Your ballot must rank all % teams — you submitted %. Refresh the page and try again.',
      v_team_count, v_submitted_count;
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
