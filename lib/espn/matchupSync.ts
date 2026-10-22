// Core matchup-sync logic, deliberately not a Server Action itself -- same shape as
// teamRecordSync.ts/rosterSync.ts so it can be called from both the commissioner's combined
// "Refresh ESPN Data" button (via refreshAll.ts) and, later, a scheduled/cron-triggered Route
// Handler. Like the other three syncs, this never guesses which ESPN team belongs to which row --
// it only touches teams that already have an espn_team_id.

import type { createClient } from '@/lib/supabase/server'
import { fetchEspnSchedule, type EspnLeagueScheduleResponse } from '@/lib/espn/client'

type SupabaseServerClient = ReturnType<typeof createClient>

export interface MatchupSyncResult {
  matchupCount: number
  warnings: string[]
}

export async function syncMatchups(
  supabase: SupabaseServerClient,
  seasonYear: number,
  espnResponse?: EspnLeagueScheduleResponse
): Promise<MatchupSyncResult> {
  const { data: teams, error } = await supabase
    .from('teams')
    .select('id, espn_team_id')
    .eq('season_year', seasonYear)
    .not('espn_team_id', 'is', null)

  if (error) throw new Error(error.message)

  if (!teams || teams.length === 0) {
    return {
      matchupCount: 0,
      warnings: ['No teams for this season have been synced with ESPN yet — sync teams first.'],
    }
  }

  espnResponse ??= await fetchEspnSchedule(seasonYear)
  const dbTeamIdByEspnTeamId = new Map(teams.map((team) => [team.espn_team_id as number, team.id]))

  const warnings = [...espnResponse.warnings]
  const payload: Array<{
    espn_matchup_id: number
    week_number: number
    is_playoffs: boolean
    home_team_id: string
    away_team_id: string
    home_score: number
    away_score: number
    winner: string
    home_projected_score: number | null
    away_projected_score: number | null
    home_win_probability: number | null
    away_win_probability: number | null
  }> = []

  for (const matchup of espnResponse.matchups) {
    const homeTeamId = dbTeamIdByEspnTeamId.get(matchup.home_espn_team_id)
    const awayTeamId = dbTeamIdByEspnTeamId.get(matchup.away_espn_team_id)
    if (!homeTeamId || !awayTeamId) {
      // Also means a matchup already synced under a since-unpaired team's old espn_team_id is
      // never cleaned up (this only upserts, never deletes) -- accepted for now since nothing in
      // the normal pairing flow un-pairs a team once set; worth revisiting if that changes.
      warnings.push(
        `Skipped matchup ${matchup.espn_matchup_id}: unpaired ESPN team id (home=${matchup.home_espn_team_id}, away=${matchup.away_espn_team_id})`
      )
      continue
    }

    payload.push({
      espn_matchup_id: matchup.espn_matchup_id,
      week_number: matchup.week,
      is_playoffs: matchup.is_playoffs,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      home_score: matchup.home_score,
      away_score: matchup.away_score,
      winner: matchup.winner,
      home_projected_score: matchup.home_projected_score,
      away_projected_score: matchup.away_projected_score,
      home_win_probability: matchup.home_win_probability,
      away_win_probability: matchup.away_win_probability,
    })
  }

  // No early return when payload is empty (e.g. every matchup this week still references an
  // unpaired team) -- the RPC call below still needs to run with an empty array so
  // espn_schedule_state.current_week gets persisted from this already-successful ESPN fetch,
  // rather than silently staying unset/stale.
  const { data, error: rpcError } = await supabase.rpc('sync_matchups', {
    p_season_year: seasonYear,
    p_current_week: espnResponse.current_week,
    p_matchups: payload,
  })
  if (rpcError) throw new Error(rpcError.message)

  const results = data as Array<{ espn_matchup_id: number; updated: boolean }>
  const matchupCount = results.filter((row) => row.updated).length

  return { matchupCount, warnings }
}
