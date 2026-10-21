'use server'

// Server Action combining the two "already-paired" ESPN refreshes -- team names and rosters --
// into one commissioner-facing action. Both are deterministic updates to teams that already have
// an espn_team_id (no guessing which team is which), unlike the one-time pairing flow in
// teams-sync-actions.ts, so there's no reason to make the commissioner run two separate buttons
// for them. See lib/espn/teamNameSync.ts and lib/espn/rosterSync.ts for the reusable core logic
// (kept as plain functions, not folded into this file, so a future cron/Route Handler can call
// them directly without going through a Server Action at all).

import { syncTeamNames } from '@/lib/espn/teamNameSync'
import { syncRosters } from '@/lib/espn/rosterSync'
import { getCommissionerClient, type ActionResult } from '@/lib/supabase/commissionerAction'

export interface EspnDataRefreshResult {
  namesUpdated: number
  teamCount: number
  playerCount: number
  warnings: string[]
}

export async function refreshEspnDataAction(
  seasonYear: number
): Promise<ActionResult<EspnDataRefreshResult>> {
  const auth = await getCommissionerClient()
  if (auth.supabase === null) return { data: null, error: auth.error }
  const { supabase } = auth

  try {
    const [nameResult, rosterResult] = await Promise.all([
      syncTeamNames(supabase, seasonYear),
      syncRosters(supabase, seasonYear),
    ])

    return {
      data: {
        namesUpdated: nameResult.teamCount,
        teamCount: rosterResult.teamCount,
        playerCount: rosterResult.playerCount,
        warnings: [...nameResult.warnings, ...rosterResult.warnings],
      },
      error: null,
    }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Failed to reach ESPN.' }
  }
}
