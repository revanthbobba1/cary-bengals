-- Verification for migration 045 (matchup_player_scores + sync_matchup_player_scores).
-- Run after applying 045, e.g.:
--   supabase db query --linked --file supabase/tests/verify_045.sql
-- Wrapped in BEGIN/ROLLBACK so nothing persists -- safe to run against a real project.
--
-- Unlike verify_042.sql/verify_044.sql, this RPC ships with the commissioner-OR-service_role
-- guard from the start (no earlier verify file covers it), so this script proves that guard
-- itself -- plain-user refusal, commissioner success, service_role success -- alongside the
-- delete+reinsert replacement behavior that's this table's actual storage model.

BEGIN;

DO $verify$
DECLARE
  v_commissioner uuid := gen_random_uuid();
  v_member uuid := gen_random_uuid();
  v_team_a uuid := gen_random_uuid();
  v_team_b uuid := gen_random_uuid();
  v_matchup_id uuid := gen_random_uuid();
  v_player_count integer;
  v_sort_order integer;
  v_player_name text;
BEGIN
  -- -------------------------------------------------------------------------
  -- Fixtures: two teams and one matchup in an isolated season.
  -- -------------------------------------------------------------------------
  INSERT INTO public.teams (id, name, owner_name, season_year, espn_team_id)
  VALUES
    (v_team_a, 'Verify045 Team A', 'Owner A', 1997, 9046),
    (v_team_b, 'Verify045 Team B', 'Owner B', 1997, 9047);

  INSERT INTO public.matchups (
    id, season_year, week_number, is_playoffs, home_team_id, away_team_id,
    home_score, away_score, winner, espn_matchup_id
  )
  VALUES (
    v_matchup_id, 1997, 1, false, v_team_a, v_team_b, 0, 0, 'UNDECIDED', 5001
  );

  INSERT INTO auth.users (id, aud, role, email)
  VALUES (v_member, 'authenticated', 'authenticated', 'verify045-member@example.test');

  -- -------------------------------------------------------------------------
  -- 1. sync_matchup_player_scores refuses a plain (non-commissioner) authenticated user.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_member,
    'role', 'authenticated',
    'app_metadata', json_build_object('roles', json_build_array('admin'))
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    PERFORM public.sync_matchup_player_scores(jsonb_build_array(
      jsonb_build_object(
        'matchup_id', v_matchup_id, 'team_side', 'home',
        'players', jsonb_build_array(
          jsonb_build_object(
            'name', 'Plain User Test Player', 'position', 'QB', 'pro_team', 'CIN',
            'lineup_slot', 'QB', 'is_starter', true, 'points', 10.0
          )
        )
      )
    ));
    RAISE EXCEPTION 'FAIL 1: a plain admin was allowed to sync box scores';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM != 'Commissioner access required.' THEN
        RAISE;
      END IF;
      RAISE NOTICE 'PASS 1: non-commissioner refused';
  END;

  EXECUTE 'RESET ROLE';

  -- -------------------------------------------------------------------------
  -- 2. sync_matchup_player_scores (as commissioner) writes the home side's players, in order.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_commissioner,
    'role', 'authenticated',
    'app_metadata', json_build_object('roles', json_build_array('commissioner'))
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  PERFORM public.sync_matchup_player_scores(jsonb_build_array(
    jsonb_build_object(
      'matchup_id', v_matchup_id, 'team_side', 'home',
      'players', jsonb_build_array(
        jsonb_build_object(
          'name', 'First Starter', 'position', 'QB', 'pro_team', 'CIN',
          'lineup_slot', 'QB', 'is_starter', true, 'points', 21.5
        ),
        jsonb_build_object(
          'name', 'Second Starter', 'position', 'RB', 'pro_team', 'CIN',
          'lineup_slot', 'RB', 'is_starter', true, 'points', 14.2
        )
      )
    )
  ));

  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_player_count
    FROM public.matchup_player_scores WHERE matchup_id = v_matchup_id AND team_side = 'home';
  IF v_player_count != 2 THEN
    RAISE EXCEPTION 'FAIL 2: expected 2 home-side players, found %', v_player_count;
  END IF;

  SELECT sort_order INTO v_sort_order
    FROM public.matchup_player_scores
    WHERE matchup_id = v_matchup_id AND team_side = 'home' AND player_name = 'Second Starter';
  IF v_sort_order != 1 THEN
    RAISE EXCEPTION 'FAIL 2: Second Starter sort_order was %, expected 1 (array order)', v_sort_order;
  END IF;
  RAISE NOTICE 'PASS 2: commissioner sync wrote both players in array order';

  -- -------------------------------------------------------------------------
  -- 3. Re-syncing the home side with a different roster replaces it (delete+reinsert) --
  --    the old players are gone, not accumulated alongside the new ones.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_commissioner,
    'role', 'authenticated',
    'app_metadata', json_build_object('roles', json_build_array('commissioner'))
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  PERFORM public.sync_matchup_player_scores(jsonb_build_array(
    jsonb_build_object(
      'matchup_id', v_matchup_id, 'team_side', 'home',
      'players', jsonb_build_array(
        jsonb_build_object(
          'name', 'Replacement Starter', 'position', 'WR', 'pro_team', 'CIN',
          'lineup_slot', 'WR', 'is_starter', true, 'points', 9.1
        )
      )
    )
  ));

  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_player_count
    FROM public.matchup_player_scores WHERE matchup_id = v_matchup_id AND team_side = 'home';
  IF v_player_count != 1 THEN
    RAISE EXCEPTION 'FAIL 3: expected exactly 1 player after replacement, found %', v_player_count;
  END IF;

  SELECT player_name INTO v_player_name
    FROM public.matchup_player_scores WHERE matchup_id = v_matchup_id AND team_side = 'home';
  IF v_player_name != 'Replacement Starter' THEN
    RAISE EXCEPTION 'FAIL 3: old players were not replaced -- found %', v_player_name;
  END IF;
  RAISE NOTICE 'PASS 3: re-sync replaced the home side (delete+reinsert), no accumulation';

  -- -------------------------------------------------------------------------
  -- 4. Away side, synced separately, is untouched by home-side re-syncs (scoped per team_side).
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_commissioner,
    'role', 'authenticated',
    'app_metadata', json_build_object('roles', json_build_array('commissioner'))
  )::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  PERFORM public.sync_matchup_player_scores(jsonb_build_array(
    jsonb_build_object(
      'matchup_id', v_matchup_id, 'team_side', 'away',
      'players', jsonb_build_array(
        jsonb_build_object(
          'name', 'Away Starter', 'position', 'TE', 'pro_team', 'CIN',
          'lineup_slot', 'TE', 'is_starter', true, 'points', 6.0
        )
      )
    )
  ));

  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_player_count
    FROM public.matchup_player_scores WHERE matchup_id = v_matchup_id AND team_side = 'home';
  IF v_player_count != 1 THEN
    RAISE EXCEPTION 'FAIL 4: syncing the away side altered the home side -- found % home rows', v_player_count;
  END IF;
  RAISE NOTICE 'PASS 4: syncing one team_side does not disturb the other';

  -- -------------------------------------------------------------------------
  -- 5. A simulated service_role request (the cron path) can also sync.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  EXECUTE 'SET LOCAL ROLE service_role';

  PERFORM public.sync_matchup_player_scores(jsonb_build_array(
    jsonb_build_object(
      'matchup_id', v_matchup_id, 'team_side', 'away',
      'players', jsonb_build_array(
        jsonb_build_object(
          'name', 'Cron Synced Player', 'position', 'K', 'pro_team', 'CIN',
          'lineup_slot', 'K', 'is_starter', true, 'points', 3.0
        )
      )
    )
  ));

  EXECUTE 'RESET ROLE';

  SELECT player_name INTO v_player_name
    FROM public.matchup_player_scores WHERE matchup_id = v_matchup_id AND team_side = 'away';
  IF v_player_name != 'Cron Synced Player' THEN
    RAISE EXCEPTION 'FAIL 5: sync did not write under a simulated service_role request';
  END IF;
  RAISE NOTICE 'PASS 5: service_role (cron path) can sync box scores';

  -- -------------------------------------------------------------------------
  -- 6. Public (anon) can read matchup_player_scores -- same public-read policy as every
  --    other table.
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '{}', true);
  EXECUTE 'SET LOCAL ROLE anon';

  SELECT count(*) INTO v_player_count
    FROM public.matchup_player_scores WHERE matchup_id = v_matchup_id;
  IF v_player_count != 2 THEN
    RAISE EXCEPTION 'FAIL 6: anon could not read matchup_player_scores rows';
  END IF;

  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'PASS 6: anon can read matchup_player_scores via the public-read policy';

  RAISE NOTICE 'All 6 checks passed.';
END
$verify$;

ROLLBACK;
