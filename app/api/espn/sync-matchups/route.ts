// Called by .github/workflows/espn-matchup-sync.yml every ~10 minutes during live NFL game
// windows -- see docs/ESPN_INTEGRATION_PLAN.md's Phase 8c-cron notes for the cron schedule and
// the cold-start handling (absorbed in the workflow, not here -- this handler assumes an
// already-warm backend and is bound by Netlify's sync-function timeout).
//
// No revalidatePath() call: /schedule is force-dynamic (see docs/NETLIFY_DEPLOYMENT.md's "Page
// Caching and Freshness"), so there is nothing cached to invalidate.

import { NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/espn/cronAuth'
import { createServiceRoleClient } from '@/lib/supabase/serviceRole'
import { syncMatchups } from '@/lib/espn/matchupSync'
import { syncMatchupPlayerScores } from '@/lib/espn/boxScoreSync'
import siteMetadata from '@/data/siteMetadata'

export async function POST(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServiceRoleClient()
    const matchupResult = await syncMatchups(supabase, siteMetadata.currentSeason)

    // Box scores read the `matchups` table to map espn_matchup_id -> matchup_id, so this must
    // run after syncMatchups commits, not in parallel with it. Caught separately so a box-score
    // failure is reported alongside a still-successful matchup sync, not as a 500 that hides it.
    try {
      const boxScoreResult = await syncMatchupPlayerScores(supabase, siteMetadata.currentSeason)
      return NextResponse.json({
        ...matchupResult,
        boxScoreSideCount: boxScoreResult.matchupSideCount,
        warnings: [...matchupResult.warnings, ...boxScoreResult.warnings],
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Box score sync failed.'
      return NextResponse.json({
        ...matchupResult,
        boxScoreSideCount: 0,
        warnings: [...matchupResult.warnings, `Box score refresh failed: ${message}`],
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Matchup sync failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
