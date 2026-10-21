'use server'

// Server Action wrapping lib/espn/rosterSync.ts's plain sync function with the commissioner
// auth gate -- see teams-sync-actions.ts for why this is a Server Action rather than a Route
// Handler, and why errors are returned as a string rather than thrown.

import { syncRosters, type RosterSyncResult } from '@/lib/espn/rosterSync'
import { getCommissionerClient, type ActionResult } from '@/lib/supabase/commissionerAction'

export async function syncRostersAction(
  seasonYear: number
): Promise<ActionResult<RosterSyncResult>> {
  const auth = await getCommissionerClient()
  if (auth.supabase === null) return { data: null, error: auth.error }

  try {
    const result = await syncRosters(auth.supabase, seasonYear)
    return { data: result, error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Failed to sync rosters.' }
  }
}
