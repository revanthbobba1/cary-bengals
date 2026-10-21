-- ESPN integration — roster display order (follow-up to 039).
--
-- team_rosters previously had no column reflecting ESPN's own roster order, so the
-- league-members query fell back to sorting bench players alphabetically by name. ESPN's own
-- app doesn't display bench in alphabetical order, and that order isn't recoverable later (it's
-- only present in the payload's array order at sync time) -- so it must be captured as a column
-- at insert time, not derived afterward.
ALTER TABLE public.team_rosters ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Same body as 039's sync_team_rosters, with one change: jsonb_array_elements WITH ORDINALITY
-- captures each player's position in ESPN's own players array as sort_order.
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
      team_id, player_name, position, pro_team, lineup_slot, is_starter, sort_order
    )
    SELECT
      v_team_id,
      p->>'name',
      p->>'position',
      p->>'pro_team',
      p->>'lineup_slot',
      (p->>'is_starter')::boolean,
      (ordinality - 1)
    FROM jsonb_array_elements(v_roster->'players') WITH ORDINALITY AS p(p, ordinality);

    GET DIAGNOSTICS v_player_count = ROW_COUNT;

    v_results := v_results || jsonb_build_object(
      'team_id', v_roster->>'team_id',
      'player_count', v_player_count
    );
  END LOOP;

  RETURN v_results;
END;
$$;
