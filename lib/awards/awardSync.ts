// Stores the winner of each weekly award for every finished week that doesn't have results yet
// (migration 058). Idempotent: it only computes weeks missing from `award_results`, so calling it
// after every ESPN refresh is cheap once caught up, and the same function backfills past seasons.
//
// A week is "finished" once ESPN's current week has moved past it. A past season has no live week,
// so the backfill passes `seasonComplete` to treat every week as finished.

import type { SupabaseClient } from '@supabase/supabase-js'
import { computeWeeklyAwards } from '@/lib/awards/weeklyAwards'
import { loadAwardMatchups } from '@/lib/awards/loadWeek'
import { SINGLE_WEEK_PLAYOFFS_FROM } from '@/lib/history/recordsData'

export interface AwardSyncResult {
  // Weeks newly stored on this call.
  weeksStored: number
}

export async function syncAwardResults(
  supabase: SupabaseClient,
  seasonYear: number,
  options: { seasonComplete?: boolean } = {}
): Promise<AwardSyncResult> {
  const [matchupsResult, storedResult, stateResult] = await Promise.all([
    supabase.from('matchups').select('week_number, is_playoffs').eq('season_year', seasonYear),
    supabase.from('award_results').select('week_number').eq('season_year', seasonYear),
    supabase
      .from('espn_schedule_state')
      .select('current_week')
      .eq('season_year', seasonYear)
      .maybeSingle(),
  ])
  if (matchupsResult.error) throw new Error(matchupsResult.error.message)
  if (storedResult.error) throw new Error(storedResult.error.message)
  if (stateResult.error) throw new Error(stateResult.error.message)

  const playoffByWeek = new Map<number, boolean>()
  for (const row of matchupsResult.data ?? []) {
    playoffByWeek.set(row.week_number, row.is_playoffs)
  }
  const stored = new Set((storedResult.data ?? []).map((row) => row.week_number))
  // Without a schedule-state row the season hasn't started syncing, so nothing is finished.
  const finishedBefore = options.seasonComplete
    ? Number.POSITIVE_INFINITY
    : (stateResult.data?.current_week ?? 0)

  const weeks = [...playoffByWeek.keys()]
    .filter((week) => week < finishedBefore && !stored.has(week))
    // 2019-2020 playoff rounds were two-week totals, not single-game scores.
    .filter((week) => !(playoffByWeek.get(week) && seasonYear < SINGLE_WEEK_PLAYOFFS_FROM))
    .sort((a, b) => a - b)

  const rows: { season_year: number; week_number: number; award_id: string; team_id: string }[] = []
  for (const week of weeks) {
    const matchups = await loadAwardMatchups(supabase, seasonYear, week)
    // Team names aren't stored, so none are needed here.
    for (const award of computeWeeklyAwards(matchups, {})) {
      rows.push({
        season_year: seasonYear,
        week_number: week,
        award_id: award.id,
        team_id: award.teamId,
      })
    }
  }

  if (rows.length === 0) return { weeksStored: 0 }

  const { error } = await supabase
    .from('award_results')
    .upsert(rows, { onConflict: 'season_year,week_number,award_id' })
  if (error) throw new Error(error.message)

  return { weeksStored: new Set(rows.map((row) => row.week_number)).size }
}
