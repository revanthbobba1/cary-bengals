-- ESPN integration — per-player box-score breakdown (follow-up to 042/044).
--
-- A child table keyed by (matchup_id, team_side), modeled on team_rosters (039/040) rather than
-- a new normalized players table -- none exists anywhere in this schema, and one isn't warranted
-- for a single-week view. No team_id/espn_team_id column: matchups.home_team_id/away_team_id
-- already resolve the team given team_side.
CREATE TABLE public.matchup_player_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matchup_id UUID NOT NULL REFERENCES public.matchups(id) ON DELETE CASCADE,
  team_side TEXT NOT NULL CHECK (team_side IN ('home', 'away')),
  player_name TEXT NOT NULL,
  position TEXT NOT NULL,
  pro_team TEXT NOT NULL,
  lineup_slot TEXT NOT NULL,
  is_starter BOOLEAN NOT NULL DEFAULT false,
  points NUMERIC(6,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_matchup_player_scores_matchup ON public.matchup_player_scores(matchup_id, team_side);

ALTER TABLE public.matchup_player_scores ENABLE ROW LEVEL SECURITY;

-- Same shape as every other table's policies: public read, commissioner-only write.
CREATE POLICY "Public can view matchup player scores"
  ON public.matchup_player_scores FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Commissioner can manage matchup player scores"
  ON public.matchup_player_scores FOR ALL
  TO authenticated
  USING (public.jwt_has_role('commissioner'));

-- Delete+reinsert per (matchup_id, team_side), not upsert -- two independent reasons:
-- (1) no stable per-row player identity is persisted anywhere in this schema (same as
--     team_rosters' own precedent), so there's no natural conflict target to upsert on;
-- (2) matchups' ON CONFLICT ... WHERE IS DISTINCT FROM guard exists specifically to avoid
--     false `updated: true` reports when a 10-minute poll finds nothing changed -- but box-score
--     points move on essentially every live poll (that's the whole premise of the feature), so
--     that guard would buy nothing here.
--
-- Gated on commissioner OR service_role from the start (the post-043 pattern), not retrofitted
-- like matchups/team_rosters were -- this RPC ships after 043, so there's no need to add the
-- bypass branch in a later migration.
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
      is_starter, points, sort_order
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
      (ordinality - 1)
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
