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
import siteMetadata from '@/data/siteMetadata'

export async function POST(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncMatchups(createServiceRoleClient(), siteMetadata.currentSeason)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Matchup sync failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
