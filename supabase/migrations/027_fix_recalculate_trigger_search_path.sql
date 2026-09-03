-- submit_poll_ballot (020) runs SECURITY DEFINER with `SET search_path = ''` -- a hardening
-- measure so a SECURITY DEFINER function can't be tricked by a malicious search_path into
-- resolving an attacker-controlled object for an unqualified name. But that `SET search_path`
-- is in effect for the ENTIRE duration of the call, including the statement-level triggers
-- its own INSERT/DELETE fire (016) -- Postgres doesn't restore the caller's search_path before
-- running a trigger mid-statement. Neither trigger_recalculate_poll_results() nor
-- recalculate_poll_results() (004) set their own search_path or schema-qualify their
-- references, so every unqualified name inside them (the function call itself, plus
-- poll_results/poll_submissions/poll_weeks) fails to resolve under the inherited empty
-- search_path -- 42883 "function recalculate_poll_results(uuid) does not exist", surfaced to
-- PostgREST as a 404. This has been live since 020 first added the empty search_path; every
-- submission has been failing at the trigger, not the RPC itself.
--
-- Fix: give both functions their own `SET search_path = ''` (defense-in-depth, matching the
-- rest of the SECURITY DEFINER functions in this project) and schema-qualify every reference
-- so they no longer depend on search_path at all, whatever it's inherited as.
CREATE OR REPLACE FUNCTION public.trigger_recalculate_poll_results()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  wk uuid;
BEGIN
  FOR wk IN SELECT DISTINCT poll_week_id FROM changed LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(wk::text));
    PERFORM public.recalculate_poll_results(wk);
  END LOOP;
  RETURN NULL;
END;
$$;

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
    team_id,
    RANK() OVER (ORDER BY avg_rank ASC) as final_rank,
    avg_rank as avg_rank_score,
    team_record,
    '-' as trend,
    num_ballots
  FROM (
    SELECT
      team_id,
      AVG(rank) as avg_rank,
      MODE() WITHIN GROUP (ORDER BY team_record) as team_record,
      COUNT(DISTINCT user_id) as num_ballots
    FROM public.poll_submissions
    WHERE poll_week_id = p_poll_week_id
    GROUP BY team_id
  ) aggregated;

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
