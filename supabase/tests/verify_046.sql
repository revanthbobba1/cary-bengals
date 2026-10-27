-- Verification for migration 046 (playoff bye support: nullable away side + is_bye).
-- Run after applying 046, e.g.:
--   supabase db query --linked --file supabase/tests/verify_046.sql
-- Wrapped in BEGIN/ROLLBACK so nothing persists -- safe to run against a real project.

BEGIN;

DO $verify$
DECLARE
  v_commissioner uuid := gen_random_uuid();
  v_team_a uuid := gen_random_uuid();
  v_team_b uuid := gen_random_uuid();
  v_row public.matchups%ROWTYPE;
  v_updated boolean;
BEGIN
  INSERT INTO public.teams (id, name, owner_name, season_year, espn_team_id)
  VALUES
    (v_team_a, 'Verify046 Team A', 'Owner A', 1996, 9046),
    (v_team_b, 'Verify046 Team B', 'Owner B', 1996, 9047);

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_commissioner,
    'role', 'authenticated',
    'app_metadata', json_build_object('roles', json_build_array('commissioner'))
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- 1. A bye row (null away side, is_bye true) round-trips.
  PERFORM public.sync_matchups(1996, 15, jsonb_build_array(
    jsonb_build_object(
      'espn_matchup_id', 1, 'week_number', 15, 'is_playoffs', true, 'is_bye', true,
      'home_team_id', v_team_a, 'away_team_id', NULL, 'home_score', 0, 'away_score', NULL,
      'winner', 'UNDECIDED'
    )
  ));
  SELECT * INTO v_row FROM public.matchups WHERE season_year = 1996 AND espn_matchup_id = 1;
  IF v_row.is_bye IS NOT TRUE OR v_row.away_team_id IS NOT NULL OR v_row.away_score IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 1: bye row did not round-trip: %', to_jsonb(v_row);
  END IF;

  -- 2. A payload with no is_bye key (older caller) defaults to a normal matchup.
  PERFORM public.sync_matchups(1996, 15, jsonb_build_array(
    jsonb_build_object(
      'espn_matchup_id', 2, 'week_number', 15, 'is_playoffs', true,
      'home_team_id', v_team_a, 'away_team_id', v_team_b, 'home_score', 10, 'away_score', 5,
      'winner', 'UNDECIDED'
    )
  ));
  SELECT * INTO v_row FROM public.matchups WHERE season_year = 1996 AND espn_matchup_id = 2;
  IF v_row.is_bye IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL 2: missing is_bye should default to false: %', to_jsonb(v_row);
  END IF;

  -- 3. The CHECK rejects an inconsistent row (is_bye true but an away team present).
  BEGIN
    PERFORM public.sync_matchups(1996, 15, jsonb_build_array(
      jsonb_build_object(
        'espn_matchup_id', 3, 'week_number', 15, 'is_playoffs', true, 'is_bye', true,
        'home_team_id', v_team_a, 'away_team_id', v_team_b, 'home_score', 0, 'away_score', 0,
        'winner', 'UNDECIDED'
      )
    ));
    RAISE EXCEPTION 'FAIL 3: inconsistent bye row was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- 4. Re-syncing an unchanged bye row is a no-op; flipping is_bye alone counts as a change.
  v_updated := (public.sync_matchups(1996, 15, jsonb_build_array(
    jsonb_build_object(
      'espn_matchup_id', 1, 'week_number', 15, 'is_playoffs', true, 'is_bye', true,
      'home_team_id', v_team_a, 'away_team_id', NULL, 'home_score', 0, 'away_score', NULL,
      'winner', 'UNDECIDED'
    )
  ))->0->>'updated')::boolean;
  IF v_updated THEN
    RAISE EXCEPTION 'FAIL 4a: unchanged bye row reported as updated';
  END IF;

  v_updated := (public.sync_matchups(1996, 15, jsonb_build_array(
    jsonb_build_object(
      'espn_matchup_id', 1, 'week_number', 15, 'is_playoffs', true, 'is_bye', false,
      'home_team_id', v_team_a, 'away_team_id', v_team_b, 'home_score', 0, 'away_score', 0,
      'winner', 'UNDECIDED'
    )
  ))->0->>'updated')::boolean;
  IF NOT v_updated THEN
    RAISE EXCEPTION 'FAIL 4b: bye -> real matchup change was not detected';
  END IF;

  RAISE NOTICE 'verify_046: all checks passed';
END;
$verify$;

ROLLBACK;
