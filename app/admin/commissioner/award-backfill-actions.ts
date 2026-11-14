'use server'

// Commissioner-only backfill of weekly award results for a completed past season (migration 058).
// The current season needs no backfill: every ESPN refresh stores each newly finished week (see
// lib/espn/refreshAll.ts). One season per call keeps each request inside a serverless function's
// time limit; components/AwardBackfill.tsx calls this once per season.

import siteMetadata from '@/data/siteMetadata'
import { syncAwardResults } from '@/lib/awards/awardSync'
import { getCommissionerClient, type ActionResult } from '@/lib/supabase/commissionerAction'

export async function backfillAwardResultsAction(
  seasonYear: number
): Promise<ActionResult<{ weeksStored: number }>> {
  const auth = await getCommissionerClient()
  if (auth.supabase === null) return { data: null, error: auth.error }

  // An in-progress season's weeks aren't all final, so marking them as such would store awards
  // for games still being played.
  if (!Number.isInteger(seasonYear) || seasonYear >= siteMetadata.currentSeason) {
    return { data: null, error: 'Only completed past seasons can be backfilled.' }
  }

  try {
    const { weeksStored } = await syncAwardResults(auth.supabase, seasonYear, {
      seasonComplete: true,
    })
    return { data: { weeksStored }, error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Backfill failed.' }
  }
}
