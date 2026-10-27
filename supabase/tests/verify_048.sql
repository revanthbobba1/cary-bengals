-- Verification for migration 048 (teams.espn_logo_url, team_rosters.injured/acquisition_type).
-- Run after applying 048, e.g.:
--   supabase db query --linked --file supabase/tests/verify_048.sql
-- Wrapped in BEGIN/ROLLBACK so nothing persists -- safe to run against a real project.
--
-- The commissioner/service_role gate and delete+reinsert behavior are covered by verify_039/043;
-- this focuses on what 048 changes: espn_logo_url round-trips through sync_espn_teams, and
-- injured/acquisition_type round-trip through sync_team_rosters, including a payload without
-- them (an older caller) getting the right defaults.

BEGIN;

DO $verify$
DECLARE
  v_commissioner uuid := gen_random_uuid();
  v_team_a uuid := gen_random_uuid();
  v_logo text;
  v_injured boolean;
  v_acquisition text;
BEGIN
  INSERT INTO public.teams (id, name, owner_name, season_year)
  VALUES (v_team_a, 'Verify048 Team A', 'Owner A', 1995);

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_commissioner,
    'role', 'authenticated',
    'app_metadata', json_build_object('roles', json_build_array('commissioner'))
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- 1. espn_logo_url round-trips through sync_espn_teams.
  PERFORM public.sync_espn_teams(1995, jsonb_build_array(
    jsonb_build_object(
      'db_team_id', v_team_a, 'name', 'Verify048 Team A', 'espn_team_id', 9048,
      'espn_owner_id', NULL, 'owner_name', NULL,
      'logo', 'https://g.espncdn.com/lm-static/logo-packs/ffl/SamplePack-TeamLogo/bears-06.svg'
    )
  ));

  SELECT espn_logo_url INTO v_logo FROM public.teams WHERE id = v_team_a;
  IF v_logo IS DISTINCT FROM
     'https://g.espncdn.com/lm-static/logo-packs/ffl/SamplePack-TeamLogo/bears-06.svg' THEN
    RAISE EXCEPTION 'FAIL 1: espn_logo_url did not round-trip: %', v_logo;
  END IF;

  -- 2. injured/acquisition_type round-trip through sync_team_rosters.
  PERFORM public.sync_team_rosters(jsonb_build_array(
    jsonb_build_object(
      'team_id', v_team_a,
      'players', jsonb_build_array(
        jsonb_build_object(
          'name', 'Hurt Waiver Add', 'position', 'RB', 'pro_team', 'SF', 'lineup_slot', 'RB',
          'is_starter', true, 'injured', true, 'acquisition_type', 'ADD'
        ),
        jsonb_build_object(
          'name', 'Older Caller', 'position', 'WR', 'pro_team', 'NE', 'lineup_slot', 'Bench',
          'is_starter', false
        )
      )
    )
  ));

  SELECT injured, acquisition_type INTO v_injured, v_acquisition
    FROM public.team_rosters WHERE player_name = 'Hurt Waiver Add';
  IF v_injured IS DISTINCT FROM true OR v_acquisition IS DISTINCT FROM 'ADD' THEN
    RAISE EXCEPTION 'FAIL 2a: injured/acquisition_type did not round-trip: % / %',
      v_injured, v_acquisition;
  END IF;

  SELECT injured, acquisition_type INTO v_injured, v_acquisition
    FROM public.team_rosters WHERE player_name = 'Older Caller';
  IF v_injured IS DISTINCT FROM false OR v_acquisition IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 2b: missing fields did not default: % / %', v_injured, v_acquisition;
  END IF;

  RAISE NOTICE 'verify_048: all checks passed';
END;
$verify$;

ROLLBACK;
