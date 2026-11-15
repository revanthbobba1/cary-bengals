// Stores the winner of each weekly award for every finished week that doesn't have results yet
// (migration 058). Idempotent: it only computes weeks missing from `award_results`, so calling it
// after every ESPN refresh is cheap once caught up.
//
// A week is "finished" once every real (non-bye) game that week has a decided winner -- ESPN leaves
// it UNDECIDED until the game is final. That works for any season, including the last week of a
// season (ESPN's "current week" never moves past that one, so it can't be used to decide).
//
// Stored weeks are never recomputed. If an award rule in weeklyAwards.ts changes, clear
// `award_results` for the affected weeks and the next sync recomputes them.

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
  seasonYear: number
): Promise<AwardSyncResult> {
  const [matchupsResult, storedResult] = await Promise.all([
    supabase
      .from('matchups')
      .select('week_number, is_playoffs, is_bye, winner')
      .eq('season_year', seasonYear),
    supabase.from('award_results').select('week_number').eq('season_year', seasonYear),
  ])
  if (matchupsResult.error) throw new Error(matchupsResult.error.message)
  if (storedResult.error) throw new Error(storedResult.error.message)

  const playoffByWeek = new Map<number, boolean>()
  // Weeks with at least one real game still undecided.
  const unfinished = new Set<number>()
  // Weeks with at least one real game at all (a week of only byes has nothing to award).
  const hasGames = new Set<number>()
  for (const row of matchupsResult.data ?? []) {
    playoffByWeek.set(row.week_number, row.is_playoffs)
    if (row.is_bye) continue
    hasGames.add(row.week_number)
    if (row.winner === 'UNDECIDED') unfinished.add(row.week_number)
  }
  const stored = new Set((storedResult.data ?? []).map((row) => row.week_number))

  const weeks = [...playoffByWeek.keys()]
    .filter((week) => hasGames.has(week) && !unfinished.has(week) && !stored.has(week))
    // 2019-2020 playoff rounds were two-week totals, not single-game scores.
    .filter((week) => !(playoffByWeek.get(week) && seasonYear < SINGLE_WEEK_PLAYOFFS_FROM))
    .sort((a, b) => a - b)

  const rows: { season_year: number; week_number: number; award_id: string; team_id: string }[] = []
  for (const week of weeks) {
    // strict: a week stored without its box scores would never get its bench/player awards.
    const matchups = await loadAwardMatchups(supabase, seasonYear, week, { strict: true })
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
