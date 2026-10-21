-- ESPN integration — roster sync (docs/ESPN_INTEGRATION_PLAN.md Phase 8, first sub-item).
--
-- Unlike team-identity sync (034/035), roster sync has no ambiguous pairing step: a roster
-- always matches an already-synced team by its known espn_team_id, so this can safely run
-- without a commissioner confirming anything row-by-row (and, unlike the team sync, is a
-- reasonable candidate for an automated/scheduled sync later).
CREATE TABLE public.team_rosters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  position TEXT NOT NULL,
  pro_team TEXT NOT NULL,
  lineup_slot TEXT NOT NULL,
  is_starter BOOLEAN NOT NULL DEFAULT false,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_team_rosters_team ON public.team_rosters(team_id);

ALTER TABLE public.team_rosters ENABLE ROW LEVEL SECURITY;

-- Same shape as teams' own policies (002/010): public read, commissioner-only write.
CREATE POLICY "Public can view team rosters"
  ON public.team_rosters FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Commissioner can manage team rosters"
  ON public.team_rosters FOR ALL
  TO authenticated
  USING (public.jwt_has_role('commissioner'));

-- Full-batch atomic sync, same pattern as sync_espn_teams (035): one transaction for the
-- whole payload, so a failure partway through never leaves some teams' rosters replaced and
-- others not. Each team's existing roster is fully replaced (delete + re-insert) rather than
-- diffed row-by-row -- rosters turn over often enough (waivers, trades) that there's no
-- meaningful "existing row" to preserve, unlike save_article_matchups' reorder case.
CREATE OR REPLACE FUNCTION public.sync_team_rosters(p_rosters jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_roster jsonb;
  v_team_id uuid;
  v_player_count integer;
  v_results jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.jwt_has_role('commissioner') THEN
    RAISE EXCEPTION 'Commissioner access required.';
  END IF;

  FOR v_roster IN SELECT * FROM jsonb_array_elements(p_rosters)
  LOOP
    v_team_id := (v_roster->>'team_id')::uuid;

    DELETE FROM public.team_rosters WHERE team_id = v_team_id;

    INSERT INTO public.team_rosters (
      team_id, player_name, position, pro_team, lineup_slot, is_starter
    )
    SELECT
      v_team_id,
      p->>'name',
      p->>'position',
      p->>'pro_team',
      p->>'lineup_slot',
      (p->>'is_starter')::boolean
    FROM jsonb_array_elements(v_roster->'players') AS p;

    GET DIAGNOSTICS v_player_count = ROW_COUNT;

    v_results := v_results || jsonb_build_object(
      'team_id', v_roster->>'team_id',
      'player_count', v_player_count
    );
  END LOOP;

  RETURN v_results;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_team_rosters(jsonb) TO authenticated;
