'use server'

// Server Action combining the two "already-paired" ESPN refreshes -- team names and rosters --
// into one commissioner-facing action. Both are deterministic updates to teams that already have
// an espn_team_id (no guessing which team is which), unlike the one-time pairing flow in
// teams-sync-actions.ts, so there's no reason to make the commissioner run two separate buttons
// for them. See lib/espn/teamNameSync.ts and lib/espn/rosterSync.ts for the reusable core logic
// (kept as plain functions, not folded into this file, so a future cron/Route Handler can call
// them directly without going through a Server Action at all).

import { revalidatePath } from 'next/cache'
import { syncTeamNames } from '@/lib/espn/teamNameSync'
import { syncRosters } from '@/lib/espn/rosterSync'
import { getCommissionerClient, type ActionResult } from '@/lib/supabase/commissionerAction'

export interface EspnDataRefreshResult {
  namesUpdated: number
  teamCount: number
  playerCount: number
  warnings: string[]
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Failed to reach ESPN.'
}

export async function refreshEspnDataAction(
  seasonYear: number
): Promise<ActionResult<EspnDataRefreshResult>> {
  const auth = await getCommissionerClient()
  if (auth.supabase === null) return { data: null, error: auth.error }
  const { supabase } = auth

  // allSettled, not all -- a rejection in one refresh must not mask a committed success in the
  // other. Both already wrote to the DB by the time either promise resolves/rejects, so losing
  // track of which one succeeded would misreport real progress as a total failure.
  const [nameSettled, rosterSettled] = await Promise.allSettled([
    syncTeamNames(supabase, seasonYear),
    syncRosters(supabase, seasonYear),
  ])

  const warnings: string[] = []
  let namesUpdated = 0
  let teamCount = 0
  let playerCount = 0

  if (nameSettled.status === 'fulfilled') {
    namesUpdated = nameSettled.value.teamCount
    warnings.push(...nameSettled.value.warnings)
  } else {
    warnings.push(`Team name refresh failed: ${errorMessage(nameSettled.reason)}`)
  }

  if (rosterSettled.status === 'fulfilled') {
    teamCount = rosterSettled.value.teamCount
    playerCount = rosterSettled.value.playerCount
    warnings.push(...rosterSettled.value.warnings)
  } else {
    warnings.push(`Roster refresh failed: ${errorMessage(rosterSettled.reason)}`)
  }

  // Both already-committed writes only reach visitors once Next's cache for the static
  // /league-members page is cleared -- without this it wouldn't update until the next deploy,
  // same reasoning as publishArticleAction's revalidatePath calls.
  if (namesUpdated > 0 || teamCount > 0) {
    revalidatePath('/league-members')
  }

  return { data: { namesUpdated, teamCount, playerCount, warnings }, error: null }
}
