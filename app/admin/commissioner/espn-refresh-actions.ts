'use server'

// Thin Server Action wrapper around lib/espn/refreshAll.ts's shared orchestration -- see that
// file for why all four syncs (names, rosters, records, matchups) run together. This file's only
// job is the commissioner auth gate; app/api/espn/sync-all/route.ts is the other caller, passing
// a service-role client instead of this commissioner-session-bound one.

import { refreshAllEspnData, type EspnDataRefreshResult } from '@/lib/espn/refreshAll'
import { getCommissionerClient, type ActionResult } from '@/lib/supabase/commissionerAction'

export type { EspnDataRefreshResult }

export async function refreshEspnDataAction(
  seasonYear: number
): Promise<ActionResult<EspnDataRefreshResult>> {
  const auth = await getCommissionerClient()
  if (auth.supabase === null) return { data: null, error: auth.error }

  const data = await refreshAllEspnData(auth.supabase, seasonYear)
  return { data, error: null }
}
