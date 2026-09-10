-- ESPN integration (docs/ESPN_INTEGRATION_PLAN.md) — Phase 6 review fix.
--
-- The Server Action originally looped independent `.update()` calls per pairing with no
-- transaction: a mid-batch failure (a transient error, or two pairings racing to claim the same
-- espn_team_id and hitting 034's partial unique index) left some teams already re-pointed to
-- their new ESPN identity and others not, with no way for the caller to tell which from a single
-- aggregate error. save_article_matchups (032) and submit_poll_ballot (020) already solved this
-- exact class of problem — a multi-row write that must not land half-applied — with one
-- SECURITY DEFINER function wrapping the whole batch in the caller's own transaction. This does
-- the same: any exception (including a unique-violation on 034's index) aborts the entire batch,
-- not just the one offending row, and every row's outcome is returned so the caller can show
-- exactly what happened instead of an opaque count.
CREATE OR REPLACE FUNCTION public.sync_espn_teams(p_season_year integer, p_pairings jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pairing jsonb;
  v_updated_count integer;
  v_results jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.jwt_has_role('commissioner') THEN
    RAISE EXCEPTION 'Commissioner access required.';
  END IF;

  FOR v_pairing IN SELECT * FROM jsonb_array_elements(p_pairings)
  LOOP
    UPDATE public.teams
    SET
      name = v_pairing->>'name',
      espn_team_id = (v_pairing->>'espn_team_id')::integer,
      espn_owner_id = v_pairing->>'espn_owner_id',
      espn_synced_at = now(),
      -- NULL in the payload (owner name not accepted this sync) leaves the existing,
      -- commissioner-curated value untouched — see docs/ESPN_INTEGRATION_PLAN.md §2.4.
      owner_name = COALESCE(v_pairing->>'owner_name', owner_name)
    WHERE id = (v_pairing->>'db_team_id')::uuid
      AND season_year = p_season_year;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    v_results := v_results || jsonb_build_object(
      'db_team_id', v_pairing->>'db_team_id',
      'updated', v_updated_count > 0
    );
  END LOOP;

  RETURN v_results;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_espn_teams(integer, jsonb) TO authenticated;
