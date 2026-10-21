// Called by .github/workflows/espn-full-sync.yml once each Tuesday/Wednesday/Thursday morning --
// this league processes waiver claims most days, and until now that was only ever caught by a
// commissioner remembering to click "Refresh ESPN Data." See docs/ESPN_INTEGRATION_PLAN.md's
// Phase 8c-cron notes for the full schedule and cold-start handling (absorbed in the workflow,
// not here).
//
// No revalidatePath() call: /league-members, /scoreboard, and /schedule are all force-dynamic
// (see docs/NETLIFY_DEPLOYMENT.md's "Page Caching and Freshness"), so there is nothing cached to
// invalidate.

import { NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/espn/cronAuth'
import { createServiceRoleClient } from '@/lib/supabase/serviceRole'
import { refreshAllEspnData } from '@/lib/espn/refreshAll'
import siteMetadata from '@/data/siteMetadata'

export async function POST(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await refreshAllEspnData(createServiceRoleClient(), siteMetadata.currentSeason)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Full ESPN refresh failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
