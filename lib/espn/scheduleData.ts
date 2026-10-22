// Shared read path for /schedule and /admin/poll's "last week's matchups" preview -- both need
// the same three things (current week, team names, all synced matchups), just sliced/grouped
// differently by the caller. Centralizing the Supabase reads here keeps fallback/error-logging
// behavior identical instead of hand-maintained copies drifting apart.
//
// /scoreboard existed as a separate current-week-only page through Phase 8c, then was folded
// into /schedule (current week pinned by default, with a week selector) once it became clear the
// two pages showed the same data at different granularity -- see docs/ESPN_INTEGRATION_PLAN.md's
// Phase 8c-data notes.

import { createPublicClient } from '@/lib/supabase/public'
import type { Matchup } from '@/lib/types/matchup'

export interface ScheduleData {
  currentWeek: number | null
  // A plain object, not a Map: /schedule passes this across a Server-to-Client Component
  // boundary (for the week selector's instant client-side switching), and a Map doesn't survive
  // that serialization.
  teamNameById: Record<string, string>
  matchups: Matchup[]
}

export async function loadScheduleData(seasonYear: number): Promise<ScheduleData> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project-ref')
  ) {
    return { currentWeek: null, teamNameById: {}, matchups: [] }
  }

  const supabase = createPublicClient()

  const [scheduleStateResult, teamsResult, matchupsResult] = await Promise.all([
    supabase
      .from('espn_schedule_state')
      .select('current_week')
      .eq('season_year', seasonYear)
      .maybeSingle(),
    supabase.from('teams').select('id, name').eq('season_year', seasonYear),
    supabase
      .from('matchups')
      .select('*')
      .eq('season_year', seasonYear)
      .order('week_number')
      .order('espn_matchup_id'),
  ])

  if (scheduleStateResult.error) {
    console.error('Failed to load ESPN schedule state:', scheduleStateResult.error)
  }
  if (teamsResult.error) {
    console.error('Failed to load teams for schedule data:', teamsResult.error)
  }
  if (matchupsResult.error) {
    console.error('Failed to load matchups:', matchupsResult.error)
  }

  const teamNameById: Record<string, string> = {}
  for (const team of teamsResult.data ?? []) {
    teamNameById[team.id] = team.name
  }

  return {
    currentWeek: scheduleStateResult.data?.current_week ?? null,
    teamNameById,
    matchups: (matchupsResult.data as Matchup[] | null) ?? [],
  }
}
