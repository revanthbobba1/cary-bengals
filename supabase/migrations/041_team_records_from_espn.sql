-- ESPN integration — Phase 8b (real team records), docs/ESPN_INTEGRATION_PLAN.md §9.
--
-- poll_results.team_record was a self-perpetuating echo with no real data behind it:
-- app/admin/poll/page.tsx showed voters last week's poll_results.team_record,
-- PollSubmissionForm.tsx silently copied that same value back into every submitted ranking's
-- team_record field (the voter never saw or edited it), submit_poll_ballot wrote whatever the
-- client sent with no validation, and the finalize trigger computed poll_results.team_record as
-- MODE() over poll_submissions.team_record — which trivially returned the value every voter was
-- shown, since none of them actually changed it. ESPN's already-fetched record{wins,losses,ties}
-- (lib/espn/client.ts, present since Phase 2) was never wired into any of this.
--
-- Fix, in four parts, all in this one migration so the column drop and the two function
-- rewrites that depend on it land atomically:
--   1. Add wins/losses/ties to teams (natural home next to espn_team_id — already ESPN-synced
--      team data) and sync_team_records() to write them, same pattern as sync_espn_teams (035).
--   2. Drop poll_submissions.team_record entirely — confirmed dead (voters never edit it) and
--      step 4 already requires touching the finalize trigger regardless, so there's no real
--      risk-reduction benefit to leaving it in place as a half-measure.
--   3. submit_poll_ballot (024): drop the team_record param/column from the insert.
--   4. recalculate_poll_results (027): source team_record from teams.wins/losses/ties directly
--      instead of MODE() over poll_submissions.

ALTER TABLE public.teams
  ADD COLUMN wins INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN losses INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN ties INTEGER NOT NULL DEFAULT 0;

-- Same shape as sync_espn_teams (035): one transaction for the whole batch, commissioner-gated,
-- matches already-paired teams by db_team_id (the caller already resolved espn_team_id -> row
-- via the same teams select every other sync does), returns a per-row {db_team_id, updated}
-- array so the caller can report exactly what happened instead of an opaque count.
CREATE OR REPLACE FUNCTION public.sync_team_records(p_season_year integer, p_records jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_record jsonb;
  v_updated_count integer;
  v_results jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.jwt_has_role('commissioner') THEN
    RAISE EXCEPTION 'Commissioner access required.';
  END IF;

  FOR v_record IN SELECT * FROM jsonb_array_elements(p_records)
  LOOP
    UPDATE public.teams
    SET
      wins = (v_record->>'wins')::integer,
      losses = (v_record->>'losses')::integer,
      ties = (v_record->>'ties')::integer
    WHERE id = (v_record->>'db_team_id')::uuid
      AND season_year = p_season_year;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    v_results := v_results || jsonb_build_object(
      'db_team_id', v_record->>'db_team_id',
      'updated', v_updated_count > 0
    );
  END LOOP;

  RETURN v_results;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_team_records(integer, jsonb) TO authenticated;

-- poll_submissions.team_record: voters never saw or edited this (it was silently echoed back
-- from last week's poll_results), so there is no in-flight data worth preserving.
ALTER TABLE public.poll_submissions DROP COLUMN team_record;

-- CREATE OR REPLACE on submit_poll_ballot (024), identical except team_record is gone from both
-- the insert's column list and the jsonb_array_elements projection.
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

  INSERT INTO public.poll_submissions (poll_week_id, user_id, team_id, rank)
  SELECT
    p_poll_week_id,
    v_user_id,
    (elem->>'team_id')::uuid,
    (elem->>'rank')::integer
  FROM jsonb_array_elements(p_rankings) AS elem;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_poll_ballot(uuid, jsonb) TO authenticated;

-- CREATE OR REPLACE on recalculate_poll_results (027): team_record now comes from a join to
-- teams.wins/losses/ties (formatted the same "W-L" / "W-L-T" shape team_record always held),
-- read at finalize time, instead of MODE() over a poll_submissions column that no longer exists.
-- CommissionerPollClient.tsx needs no change — it already just reads result.team_record.
CREATE OR REPLACE FUNCTION public.recalculate_poll_results(p_poll_week_id UUID)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.poll_results WHERE poll_week_id = p_poll_week_id;

  INSERT INTO public.poll_results (poll_week_id, team_id, final_rank, avg_rank_score, team_record, trend, num_ballots)
  SELECT
    p_poll_week_id,
    aggregated.team_id,
    RANK() OVER (ORDER BY aggregated.avg_rank ASC) as final_rank,
    aggregated.avg_rank as avg_rank_score,
    CASE
      WHEN t.ties > 0 THEN t.wins::text || '-' || t.losses::text || '-' || t.ties::text
      ELSE t.wins::text || '-' || t.losses::text
    END as team_record,
    '-' as trend,
    aggregated.num_ballots
  FROM (
    SELECT
      team_id,
      AVG(rank) as avg_rank,
      COUNT(DISTINCT user_id) as num_ballots
    FROM public.poll_submissions
    WHERE poll_week_id = p_poll_week_id
    GROUP BY team_id
  ) aggregated
  JOIN public.teams t ON t.id = aggregated.team_id;

  UPDATE public.poll_results pr
  SET trend = CASE
    WHEN prev_rank IS NULL THEN '-'
    WHEN prev_rank > pr.final_rank THEN '↑' || (prev_rank - pr.final_rank)::text
    WHEN prev_rank < pr.final_rank THEN '↓' || (pr.final_rank - prev_rank)::text
    ELSE '-'
  END
  FROM (
    SELECT
      pr2.team_id,
      pr2.final_rank as prev_rank
    FROM public.poll_results pr2
    JOIN public.poll_weeks pw2 ON pr2.poll_week_id = pw2.id
    WHERE pw2.season_year = (SELECT season_year FROM public.poll_weeks WHERE id = p_poll_week_id)
      AND pw2.week_number = (SELECT week_number - 1 FROM public.poll_weeks WHERE id = p_poll_week_id)
  ) previous
  WHERE pr.team_id = previous.team_id
    AND pr.poll_week_id = p_poll_week_id;
END;
$$;
