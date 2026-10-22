-- ESPN integration — Phase 8c-cron (scheduled auto-sync), docs/ESPN_INTEGRATION_PLAN.md §9.
--
-- A scheduled GitHub Actions job has no commissioner session, but every sync RPC so far is
-- gated on jwt_has_role('commissioner'), which only exists for a real signed-in user. This adds
-- an `OR auth.role() = 'service_role'` branch to all four existing sync RPCs
-- (sync_espn_teams/035, sync_team_rosters/040, sync_team_records/041, sync_matchups/042) so a
-- Route Handler using a Supabase service-role key can call them too, identical one-line change
-- repeated four times. No other change to any of the four bodies -- CREATE OR REPLACE here is a
-- straight copy of each function's latest version with that one line touched.
--
-- Honest tradeoff, not minimized: a service-role key is strictly more powerful than
-- commissioner, not role-equivalent -- it bypasses RLS on every table in the project, not just
-- the ones a jwt_has_role('commissioner') policy explicitly covers. Mitigated by containment, not
-- narrow scope: lib/supabase/serviceRole.ts is the only file that ever reads
-- SUPABASE_SERVICE_ROLE_KEY, and both Route Handlers that construct it check a separate shared
-- secret (x-cron-secret) first, before the key is ever touched. See the Phase 8c-cron plan notes
-- in docs/ESPN_INTEGRATION_PLAN.md for the full reasoning.

-- sync_espn_teams (035): unchanged body, guard only.
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

GRANT EXECUTE ON FUNCTION public.sync_espn_teams(integer, jsonb) TO service_role;

-- sync_team_rosters (040, latest): unchanged body, guard only.
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

GRANT EXECUTE ON FUNCTION public.sync_team_rosters(jsonb) TO service_role;

-- sync_team_records (041): unchanged body, guard only.
CREATE OR REPLACE FUNCTION public.sync_team_records(p_season_year integer, p_records jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_record jsonb;
  v_updated_count integer;
  v_results jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.jwt_has_role('commissioner') OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Commissioner access required.';
  END IF;

  FOR v_record IN SELECT * FROM jsonb_array_elements(p_records)
  LOOP
    UPDATE public.teams
    SET
      wins = (v_record->>'wins')::integer,
      losses = (v_record->>'losses')::integer,
      ties = (v_record->>'ties')::integer
    WHERE id = (v_record->>'db_team_id')::uuid
      AND season_year = p_season_year;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    v_results := v_results || jsonb_build_object(
      'db_team_id', v_record->>'db_team_id',
      'updated', v_updated_count > 0
    );
  END LOOP;

  RETURN v_results;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_team_records(integer, jsonb) TO service_role;

-- sync_matchups (042, latest -- including its ON CONFLICT ... WHERE guard): unchanged body,
-- guard only.
CREATE OR REPLACE FUNCTION public.sync_matchups(
  p_season_year integer, p_current_week integer, p_matchups jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_matchup jsonb;
  v_updated_count integer;
  v_results jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.jwt_has_role('commissioner') OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Commissioner access required.';
  END IF;

  INSERT INTO public.espn_schedule_state (season_year, current_week)
  VALUES (p_season_year, p_current_week)
  ON CONFLICT (season_year) DO UPDATE SET
    current_week = EXCLUDED.current_week, updated_at = now();

  FOR v_matchup IN SELECT * FROM jsonb_array_elements(p_matchups)
  LOOP
    INSERT INTO public.matchups (
      season_year, week_number, is_playoffs, home_team_id, away_team_id,
      home_score, away_score, winner, espn_matchup_id, synced_at
    )
    VALUES (
      p_season_year,
      (v_matchup->>'week_number')::integer,
      (v_matchup->>'is_playoffs')::boolean,
      (v_matchup->>'home_team_id')::uuid,
      (v_matchup->>'away_team_id')::uuid,
      (v_matchup->>'home_score')::numeric,
      (v_matchup->>'away_score')::numeric,
      v_matchup->>'winner',
      (v_matchup->>'espn_matchup_id')::integer,
      now()
    )
    ON CONFLICT (season_year, espn_matchup_id) DO UPDATE SET
      week_number = EXCLUDED.week_number,
      is_playoffs = EXCLUDED.is_playoffs,
      home_team_id = EXCLUDED.home_team_id,
      away_team_id = EXCLUDED.away_team_id,
      home_score = EXCLUDED.home_score,
      away_score = EXCLUDED.away_score,
      winner = EXCLUDED.winner,
      synced_at = now()
    WHERE
      public.matchups.week_number IS DISTINCT FROM EXCLUDED.week_number
      OR public.matchups.is_playoffs IS DISTINCT FROM EXCLUDED.is_playoffs
      OR public.matchups.home_team_id IS DISTINCT FROM EXCLUDED.home_team_id
      OR public.matchups.away_team_id IS DISTINCT FROM EXCLUDED.away_team_id
      OR public.matchups.home_score IS DISTINCT FROM EXCLUDED.home_score
      OR public.matchups.away_score IS DISTINCT FROM EXCLUDED.away_score
      OR public.matchups.winner IS DISTINCT FROM EXCLUDED.winner;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    v_results := v_results || jsonb_build_object(
      'espn_matchup_id', v_matchup->>'espn_matchup_id', 'updated', v_updated_count > 0
    );
  END LOOP;

  RETURN v_results;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_matchups(integer, integer, jsonb) TO service_role;
