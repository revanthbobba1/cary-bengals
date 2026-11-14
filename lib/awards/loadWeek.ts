// One week's matchups with their box scores, in the shape computeWeeklyAwards reads. Shared by the
// home page (live read of last week) and lib/awards/awardSync.ts (stores finished weeks).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AwardMatchup } from '@/lib/awards/weeklyAwards'
import type { MatchupPlayerScore } from '@/lib/types/matchup'

// Throws if the matchups read fails. A box-score failure only costs the bench/player awards (the
// score-based ones still compute), so it is logged and the week is returned without player rows.
export async function loadAwardMatchups(
  supabase: SupabaseClient,
  season: number,
  weekNumber: number
): Promise<AwardMatchup[]> {
  const { data: rows, error } = await supabase
    .from('matchups')
    .select('id, is_bye, home_team_id, away_team_id, home_score, away_score')
    .eq('season_year', season)
    .eq('week_number', weekNumber)
  if (error) throw error
  if (!rows?.length) return []

  const { data: playerRows, error: playersError } = await supabase
    .from('matchup_player_scores')
    .select(
      'id, matchup_id, team_side, player_name, position, pro_team, lineup_slot, is_starter, points, sort_order'
    )
    .in(
      'matchup_id',
      rows.map((m) => m.id)
    )
    .order('sort_order')
  if (playersError) console.error('Failed to load player scores for awards:', playersError)

  const playersBySide = new Map<string, MatchupPlayerScore[]>()
  for (const row of playersError ? [] : (playerRows ?? [])) {
    const key = `${row.matchup_id}:${row.team_side}`
    const group = playersBySide.get(key) ?? []
    // Awards only read these fields; the stat breakdown/availability aren't needed here.
    group.push({ ...row, stat_breakdown: {}, availability: null } as MatchupPlayerScore)
    playersBySide.set(key, group)
  }

  return rows.map((m) => ({
    is_bye: m.is_bye,
    home_team_id: m.home_team_id,
    away_team_id: m.away_team_id,
    home_score: m.home_score,
    away_score: m.away_score,
    home_player_scores: playersBySide.get(`${m.id}:home`) ?? null,
    away_player_scores: playersBySide.get(`${m.id}:away`) ?? null,
  }))
}
