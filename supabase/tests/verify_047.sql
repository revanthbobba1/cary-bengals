-- Verification for migration 047 (matchup_player_scores.stat_breakdown + availability).
-- Run after applying 047, e.g.:
--   supabase db query --linked --file supabase/tests/verify_047.sql
-- Wrapped in BEGIN/ROLLBACK so nothing persists -- safe to run against a real project.
--
-- The commissioner/service_role gate and delete+reinsert behavior are covered by verify_045.sql;
-- this focuses on what 047 changes: both new columns round-trip, a payload without them (an
-- older caller) gets the defaults, and the CHECK rejects an unknown availability value.

BEGIN;

DO $verify$
DECLARE
  v_commissioner uuid := gen_random_uuid();
  v_team_a uuid := gen_random_uuid();
  v_team_b uuid := gen_random_uuid();
  v_matchup_id uuid := gen_random_uuid();
  v_breakdown jsonb;
  v_availability text;
BEGIN
  INSERT INTO public.teams (id, name, owner_name, season_year, espn_team_id)
  VALUES
    (v_team_a, 'Verify047 Team A', 'Owner A', 1995, 9046),
    (v_team_b, 'Verify047 Team B', 'Owner B', 1995, 9047);

  INSERT INTO public.matchups (
    id, season_year, week_number, is_playoffs, home_team_id, away_team_id,
    home_score, away_score, winner, espn_matchup_id
  )
  VALUES (v_matchup_id, 1995, 1, false, v_team_a, v_team_b, 0, 0, 'UNDECIDED', 5001);

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_commissioner,
    'role', 'authenticated',
    'app_metadata', json_build_object('roles', json_build_array('commissioner'))
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- 1. stat_breakdown and availability round-trip; a payload without them gets the defaults.
  PERFORM public.sync_matchup_player_scores(jsonb_build_array(
    jsonb_build_object(
      'matchup_id', v_matchup_id, 'team_side', 'home',
      'players', jsonb_build_array(
        jsonb_build_object(
          'name', 'Played', 'position', 'QB', 'pro_team', 'NE', 'lineup_slot', 'QB',
          'is_starter', true, 'points', 27.44,
          'stat_breakdown', jsonb_build_object('Passing Yards', 321, 'Passing TDs', 2),
          'availability', NULL
        ),
        jsonb_build_object(
          'name', 'On Bye', 'position', 'QB', 'pro_team', 'BUF', 'lineup_slot', 'Bench',
          'is_starter', false, 'points', 0,
          'stat_breakdown', '{}'::jsonb, 'availability', 'bye'
        ),
        jsonb_build_object(
          'name', 'Older Caller', 'position', 'RB', 'pro_team', 'SF', 'lineup_slot', 'RB',
          'is_starter', true, 'points', 0
        )
      )
    )
  ));

  SELECT stat_breakdown, availability INTO v_breakdown, v_availability
    FROM public.matchup_player_scores WHERE player_name = 'Played';
  IF v_breakdown IS DISTINCT FROM '{"Passing Yards": 321, "Passing TDs": 2}'::jsonb
     OR v_availability IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 1a: played row did not round-trip: % / %', v_breakdown, v_availability;
  END IF;

  SELECT availability INTO v_availability
    FROM public.matchup_player_scores WHERE player_name = 'On Bye';
  IF v_availability IS DISTINCT FROM 'bye' THEN
    RAISE EXCEPTION 'FAIL 1b: bye availability did not round-trip: %', v_availability;
  END IF;

  SELECT stat_breakdown, availability INTO v_breakdown, v_availability
    FROM public.matchup_player_scores WHERE player_name = 'Older Caller';
  IF v_breakdown IS DISTINCT FROM '{}'::jsonb OR v_availability IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 1c: missing fields did not default: % / %', v_breakdown, v_availability;
  END IF;

  -- 2. The CHECK rejects an unknown availability value.
  BEGIN
    PERFORM public.sync_matchup_player_scores(jsonb_build_array(
      jsonb_build_object(
        'matchup_id', v_matchup_id, 'team_side', 'away',
        'players', jsonb_build_array(
          jsonb_build_object(
            'name', 'Bad', 'position', 'WR', 'pro_team', 'SF', 'lineup_slot', 'WR',
            'is_starter', true, 'points', 0, 'availability', 'suspended'
          )
        )
      )
    ));
    RAISE EXCEPTION 'FAIL 2: an unknown availability value was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  RAISE NOTICE 'verify_047: all checks passed';
END;
$verify$;

ROLLBACK;
