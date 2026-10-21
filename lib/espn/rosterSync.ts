// Core roster-sync logic, deliberately not a Server Action itself -- a plain function callable
// from both app/admin/commissioner/roster-sync-actions.ts (the commissioner's manual "Sync
// Rosters" button) and, later, a scheduled/cron-triggered Route Handler, without duplicating the
// fetch -> match -> write logic. Unlike team-identity sync (034/035), this has no ambiguous
// pairing step: a roster always matches an already-synced team by its known espn_team_id, so
// there's nothing here that specifically requires a human in the loop.

import type { createClient } from '@/lib/supabase/server'
import { fetchEspnRosters } from '@/lib/espn/client'

type SupabaseServerClient = ReturnType<typeof createClient>

export interface RosterSyncResult {
  teamCount: number
  playerCount: number
  warnings: string[]
}

export async function syncRosters(
  supabase: SupabaseServerClient,
  seasonYear: number
): Promise<RosterSyncResult> {
  const { data: teams, error } = await supabase
    .from('teams')
    .select('id, espn_team_id')
    .eq('season_year', seasonYear)
    .not('espn_team_id', 'is', null)

  if (error) throw new Error(error.message)

  if (!teams || teams.length === 0) {
    return {
      teamCount: 0,
      playerCount: 0,
      warnings: ['No teams for this season have been synced with ESPN yet — sync teams first.'],
    }
  }

  const espnResponse = await fetchEspnRosters(seasonYear)
  const rosterByEspnTeamId = new Map(espnResponse.teams.map((team) => [team.espn_team_id, team]))

  const warnings = [...espnResponse.warnings]
  const payload: Array<{
    team_id: string
    players: Array<{
      name: string
      position: string
      pro_team: string
      lineup_slot: string
      is_starter: boolean
    }>
  }> = []

  for (const team of teams) {
    const roster = rosterByEspnTeamId.get(team.espn_team_id as number)
    if (!roster) {
      warnings.push(`No ESPN roster found for team ${team.id} (espn_team_id=${team.espn_team_id})`)
      continue
    }
    payload.push({ team_id: team.id, players: roster.players })
  }

  if (payload.length === 0) {
    return { teamCount: 0, playerCount: 0, warnings }
  }

  const { data, error: rpcError } = await supabase.rpc('sync_team_rosters', {
    p_rosters: payload,
  })
  if (rpcError) throw new Error(rpcError.message)

  const results = data as Array<{ team_id: string; player_count: number }>
  const playerCount = results.reduce((sum, row) => sum + row.player_count, 0)

  return { teamCount: results.length, playerCount, warnings }
}
