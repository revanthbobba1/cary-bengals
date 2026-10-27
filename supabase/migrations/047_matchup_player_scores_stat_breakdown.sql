-- ESPN integration -- per-player stat breakdown + availability (follow-up to 045).
--
-- stat_breakdown is stored already labeled ({"Passing Yards": 275, ...}), not as raw numeric
-- ESPN ids, so the backend stays the one place that understands ESPN's codes. A JSONB column on
-- the row, not a child table: it's always read as one unit per player and never filtered or
-- aggregated on its own. Postgres JSONB does not preserve key order, so the frontend must supply
-- its own display order.
--
-- availability explains a missing stat line (null = the player played): bye (NFL team on bye),
-- ir (IR slot), out (ESPN injury status OUT), dnp (team played, player didn't), pending (no line
-- yet and not a bye, i.e. the game hasn't started). Derived in the ESPN service, see
-- backend/app/services/boxscore.py.

ALTER TABLE public.matchup_player_scores
  ADD COLUMN stat_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN availability TEXT
    CHECK (availability IN ('bye', 'ir', 'out', 'dnp', 'pending'));

-- CREATE OR REPLACE on top of 045's version: adds the two new columns to the insert; the
-- delete+reinsert design and the commissioner/service_role gate carry over unchanged.
CREATE OR REPLACE FUNCTION public.sync_matchup_player_scores(p_box_scores jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_box_score jsonb;
  v_matchup_id uuid;
  v_team_side text;
  v_player_count integer;
  v_results jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.jwt_has_role('commissioner') OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Commissioner access required.';
  END IF;

  FOR v_box_score IN SELECT * FROM jsonb_array_elements(p_box_scores)
  LOOP
    v_matchup_id := (v_box_score->>'matchup_id')::uuid;
    v_team_side := v_box_score->>'team_side';

    DELETE FROM public.matchup_player_scores
      WHERE matchup_id = v_matchup_id AND team_side = v_team_side;

    INSERT INTO public.matchup_player_scores (
      matchup_id, team_side, player_name, position, pro_team, lineup_slot,
      is_starter, points, sort_order, stat_breakdown, availability
    )
    SELECT
      v_matchup_id,
      v_team_side,
      p->>'name',
      p->>'position',
      p->>'pro_team',
      p->>'lineup_slot',
      (p->>'is_starter')::boolean,
      (p->>'points')::numeric,
      (ordinality - 1),
      COALESCE(p->'stat_breakdown', '{}'::jsonb),
      p->>'availability'
    FROM jsonb_array_elements(v_box_score->'players') WITH ORDINALITY AS p(p, ordinality);

    GET DIAGNOSTICS v_player_count = ROW_COUNT;

    v_results := v_results || jsonb_build_object(
      'matchup_id', v_box_score->>'matchup_id',
      'team_side', v_team_side,
      'player_count', v_player_count
    );
  END LOOP;

  RETURN v_results;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_matchup_player_scores(jsonb) TO authenticated, service_role;
