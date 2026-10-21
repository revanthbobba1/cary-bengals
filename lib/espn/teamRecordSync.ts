// Core team-record-refresh logic, deliberately not a Server Action itself -- same shape as
// teamNameSync.ts/rosterSync.ts so all three can be called from
// app/admin/commissioner/espn-refresh-actions.ts (the commissioner's combined "Refresh ESPN
// Data" button) and, later, a scheduled/cron-triggered Route Handler. Like those two, this never
// guesses which ESPN team belongs to which row -- it only touches teams that already have an
// espn_team_id, so there's nothing here that specifically requires a human in the loop.

import type { createClient } from '@/lib/supabase/server'
import { fetchEspnTeams } from '@/lib/espn/client'

type SupabaseServerClient = ReturnType<typeof createClient>

export interface TeamRecordSyncResult {
  teamCount: number
  warnings: string[]
}

export async function syncTeamRecords(
  supabase: SupabaseServerClient,
  seasonYear: number
): Promise<TeamRecordSyncResult> {
  const { data: teams, error } = await supabase
    .from('teams')
    .select('id, espn_team_id, wins, losses, ties')
    .eq('season_year', seasonYear)
    .not('espn_team_id', 'is', null)

  if (error) throw new Error(error.message)

  if (!teams || teams.length === 0) {
    return { teamCount: 0, warnings: [] }
  }

  const espnResponse = await fetchEspnTeams(seasonYear)
  const espnTeamById = new Map(espnResponse.teams.map((team) => [team.espn_team_id, team]))

  const warnings = [...espnResponse.warnings]
  const payload: Array<{
    db_team_id: string
    wins: number
    losses: number
    ties: number
  }> = []

  for (const team of teams) {
    const espnTeam = espnTeamById.get(team.espn_team_id as number)
    if (!espnTeam) {
      warnings.push(`No ESPN team found for team ${team.id} (espn_team_id=${team.espn_team_id})`)
      continue
    }
    // Only records that actually changed get written -- re-syncing the same wins/losses/ties
    // every refresh is harmless, but skipping unchanged rows keeps the result count meaningful.
    if (
      espnTeam.record.wins === team.wins &&
      espnTeam.record.losses === team.losses &&
      espnTeam.record.ties === team.ties
    ) {
      continue
    }

    payload.push({
      db_team_id: team.id,
      wins: espnTeam.record.wins,
      losses: espnTeam.record.losses,
      ties: espnTeam.record.ties,
    })
  }

  if (payload.length === 0) {
    return { teamCount: 0, warnings }
  }

  const { data, error: rpcError } = await supabase.rpc('sync_team_records', {
    p_season_year: seasonYear,
    p_records: payload,
  })
  if (rpcError) throw new Error(rpcError.message)

  const results = data as Array<{ db_team_id: string; updated: boolean }>
  const teamCount = results.filter((row) => row.updated).length

  return { teamCount, warnings }
}
