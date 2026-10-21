// Shared read path for /scoreboard and /schedule -- both need the same three things
// (current week, team names, all synced matchups), just sliced/grouped differently by the
// caller. Centralizing the Supabase reads here keeps the two pages' fallback/error-logging
// behavior identical instead of two hand-maintained copies drifting apart.

import { createPublicClient } from '@/lib/supabase/public'
import type { Matchup } from '@/lib/types/matchup'

export interface ScheduleData {
  currentWeek: number | null
  teamNameById: Map<string, string>
  matchups: Matchup[]
}

export async function loadScheduleData(seasonYear: number): Promise<ScheduleData> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project-ref')
  ) {
    return { currentWeek: null, teamNameById: new Map(), matchups: [] }
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

  const teamNameById = new Map<string, string>()
  for (const team of teamsResult.data ?? []) {
    teamNameById.set(team.id, team.name)
  }

  return {
    currentWeek: scheduleStateResult.data?.current_week ?? null,
    teamNameById,
    matchups: (matchupsResult.data as Matchup[] | null) ?? [],
  }
}
