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
import type { Matchup, MatchupPlayerScore } from '@/lib/types/matchup'

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

  type SyncedMatchup = Omit<Matchup, 'home_player_scores' | 'away_player_scores'>
  const matchups = (matchupsResult.data as SyncedMatchup[] | null) ?? []

  // A separate query, not a 4th parallel one -- it needs this season's matchup ids, which only
  // exist once the query above has resolved. Scoped to every synced week, not just the current
  // one: a week's player-score rows persist once synced (see MatchupPlayerScore's comment in
  // lib/types/matchup.ts), so this grows over the season, not just the current week's ~190 rows.
  const playerScoresByMatchupAndSide = new Map<string, MatchupPlayerScore[]>()
  if (matchups.length > 0) {
    const { data: playerScores, error: playerScoresError } = await supabase
      .from('matchup_player_scores')
      .select(
        'id, matchup_id, team_side, player_name, position, pro_team, lineup_slot, is_starter, points, sort_order'
      )
      .in(
        'matchup_id',
        matchups.map((matchup) => matchup.id)
      )
      .order('sort_order')

    if (playerScoresError) {
      console.error('Failed to load matchup player scores:', playerScoresError)
    } else {
      for (const row of playerScores ?? []) {
        const key = `${row.matchup_id}:${row.team_side}`
        const group = playerScoresByMatchupAndSide.get(key) ?? []
        group.push({
          id: row.id,
          player_name: row.player_name,
          position: row.position,
          pro_team: row.pro_team,
          lineup_slot: row.lineup_slot,
          is_starter: row.is_starter,
          points: row.points,
          sort_order: row.sort_order,
        })
        playerScoresByMatchupAndSide.set(key, group)
      }
    }
  }

  return {
    currentWeek: scheduleStateResult.data?.current_week ?? null,
    teamNameById,
    matchups: matchups.map((matchup) => ({
      ...matchup,
      home_player_scores: playerScoresByMatchupAndSide.get(`${matchup.id}:home`) ?? null,
      away_player_scores: playerScoresByMatchupAndSide.get(`${matchup.id}:away`) ?? null,
    })),
  }
}
