-- ESPN integration — team logos and roster metadata.
--
-- Three small additions surfaced while reviewing what else ESPN's API already returns but this
-- app never stored: a team's logo image (teams.espn_logo_url, mTeam view's own `logo` field --
-- confirmed real and per-team, not a shared placeholder, across all 12 teams in the captured
-- fixture), whether a player is currently flagged injured (team_rosters.injured, mRoster view's
-- own `injured` boolean -- a plainer signal than the richer `injuryStatus` string the box
-- score's mLiveScoring view carries, which isn't present in this view), and how a player joined
-- the roster (team_rosters.acquisition_type, mRoster view's `acquisitionType` per entry --
-- DRAFT/ADD observed in the captured fixture, TRADE expected but not yet seen; kept as free text
-- rather than hard-enumerated, same reasoning as matchups.winner's TIE case).
ALTER TABLE public.teams ADD COLUMN espn_logo_url TEXT;

ALTER TABLE public.team_rosters ADD COLUMN injured BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.team_rosters ADD COLUMN acquisition_type TEXT;

-- sync_espn_teams (043's version, latest): same body, now also writing espn_logo_url.
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
  IF NOT (public.jwt_has_role('commissioner') OR auth.role() = 'service_role') THEN
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
      espn_logo_url = v_pairing->>'logo',
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

-- sync_team_rosters (043's version, latest): same body, now also writing injured/acquisition_type.
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
  IF NOT (public.jwt_has_role('commissioner') OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Commissioner access required.';
  END IF;

  FOR v_roster IN SELECT * FROM jsonb_array_elements(p_rosters)
  LOOP
    v_team_id := (v_roster->>'team_id')::uuid;

    DELETE FROM public.team_rosters WHERE team_id = v_team_id;

    INSERT INTO public.team_rosters (
      team_id, player_name, position, pro_team, lineup_slot, is_starter, sort_order,
      injured, acquisition_type
    )
    SELECT
      v_team_id,
      p->>'name',
      p->>'position',
      p->>'pro_team',
      p->>'lineup_slot',
      (p->>'is_starter')::boolean,
      (ordinality - 1),
      COALESCE((p->>'injured')::boolean, false),
      p->>'acquisition_type'
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
