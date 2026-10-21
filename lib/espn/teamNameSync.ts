// Core team-name-refresh logic, deliberately not a Server Action itself -- mirrors
// rosterSync.ts's shape so both can be called from app/admin/commissioner/espn-refresh-actions.ts
// (the commissioner's combined "Refresh ESPN Data" button) and, later, a scheduled/cron-triggered
// Route Handler. Unlike the initial pairing flow (teams-sync-actions.ts), this never guesses which
// ESPN team belongs to which row -- it only touches teams that already have an espn_team_id, so
// there's nothing here that specifically requires a human in the loop.

import type { createClient } from '@/lib/supabase/server'
import { fetchEspnTeams, type EspnLeagueTeamsResponse } from '@/lib/espn/client'

type SupabaseServerClient = ReturnType<typeof createClient>

export interface TeamNameSyncResult {
  teamCount: number
  warnings: string[]
}

export async function syncTeamNames(
  supabase: SupabaseServerClient,
  seasonYear: number,
  // espn-refresh-actions.ts already fetches this same endpoint for syncTeamRecords -- passing its
  // response through here avoids firing two concurrent requests for identical data against a
  // Render free-tier service that can cold-start. Falls back to its own fetch so this stays
  // independently callable (e.g. a future cron/Route Handler syncing names alone).
  espnResponse?: EspnLeagueTeamsResponse
): Promise<TeamNameSyncResult> {
  const { data: teams, error } = await supabase
    .from('teams')
    .select('id, name, espn_team_id')
    .eq('season_year', seasonYear)
    .not('espn_team_id', 'is', null)

  if (error) throw new Error(error.message)

  if (!teams || teams.length === 0) {
    return { teamCount: 0, warnings: [] }
  }

  espnResponse ??= await fetchEspnTeams(seasonYear)
  const espnTeamById = new Map(espnResponse.teams.map((team) => [team.espn_team_id, team]))

  const warnings = [...espnResponse.warnings]
  const payload: Array<{
    db_team_id: string
    name: string
    espn_team_id: number
    espn_owner_id: string | null
    owner_name: string | null
  }> = []

  for (const team of teams) {
    const espnTeam = espnTeamById.get(team.espn_team_id as number)
    if (!espnTeam) {
      warnings.push(`No ESPN team found for team ${team.id} (espn_team_id=${team.espn_team_id})`)
      continue
    }
    // Only names that actually changed get written -- re-pairing the same espn_team_id every
    // refresh is harmless to sync_espn_teams, but skipping unchanged rows keeps the result count
    // meaningful ("3 names updated" rather than "12 teams touched, 9 of them no-ops").
    if (espnTeam.name === team.name) continue

    payload.push({
      db_team_id: team.id,
      name: espnTeam.name,
      espn_team_id: espnTeam.espn_team_id,
      espn_owner_id: espnTeam.espn_owner_id,
      // Owner-name acceptance is a judgment call (ESPN's display name is often a generated
      // username, per the pairing flow) -- a name refresh never touches it.
      owner_name: null,
    })
  }

  if (payload.length === 0) {
    return { teamCount: 0, warnings }
  }

  const { data, error: rpcError } = await supabase.rpc('sync_espn_teams', {
    p_season_year: seasonYear,
    p_pairings: payload,
  })
  if (rpcError) throw new Error(rpcError.message)

  const results = data as Array<{ db_team_id: string; updated: boolean }>
  const teamCount = results.filter((row) => row.updated).length

  return { teamCount, warnings }
}
