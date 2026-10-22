// Per-player box-score sync, same shape as matchupSync.ts/rosterSync.ts so it can be called from
// both the commissioner's "Refresh ESPN Data" button (via refreshAll.ts) and the matchup cron
// Route Handler. Unlike those, this maps against the already-synced `matchups` table (not
// `teams`) -- box scores are keyed by matchup, not by team -- which means this must run *after*
// syncMatchups has committed for the same season, not alongside it (see refreshAll.ts's comment).

import type { createClient } from '@/lib/supabase/server'
import { fetchEspnBoxScores } from '@/lib/espn/client'

type SupabaseServerClient = ReturnType<typeof createClient>

export interface BoxScoreSyncResult {
  matchupSideCount: number
  warnings: string[]
}

export async function syncMatchupPlayerScores(
  supabase: SupabaseServerClient,
  seasonYear: number
): Promise<BoxScoreSyncResult> {
  const { data: matchups, error } = await supabase
    .from('matchups')
    .select('id, espn_matchup_id')
    .eq('season_year', seasonYear)

  if (error) throw new Error(error.message)

  if (!matchups || matchups.length === 0) {
    return {
      matchupSideCount: 0,
      warnings: ['No matchups for this season have been synced yet — sync matchups first.'],
    }
  }

  const espnResponse = await fetchEspnBoxScores(seasonYear)
  const matchupIdByEspnMatchupId = new Map(
    matchups.map((matchup) => [matchup.espn_matchup_id as number, matchup.id])
  )

  const warnings = [...espnResponse.warnings]
  const payload: Array<{
    matchup_id: string
    team_side: 'home' | 'away'
    players: Array<{
      name: string
      position: string
      pro_team: string
      lineup_slot: string
      is_starter: boolean
      points: number
    }>
  }> = []

  for (const boxScore of espnResponse.matchups) {
    const matchupId = matchupIdByEspnMatchupId.get(boxScore.espn_matchup_id)
    if (!matchupId) {
      warnings.push(
        `Skipped box score for ESPN matchup ${boxScore.espn_matchup_id} (${boxScore.team_side}): matchup not yet synced`
      )
      continue
    }
    payload.push({
      matchup_id: matchupId,
      team_side: boxScore.team_side,
      players: boxScore.players,
    })
  }

  if (payload.length === 0) {
    return { matchupSideCount: 0, warnings }
  }

  const { data, error: rpcError } = await supabase.rpc('sync_matchup_player_scores', {
    p_box_scores: payload,
  })
  if (rpcError) throw new Error(rpcError.message)

  const results = data as Array<{ matchup_id: string; team_side: string; player_count: number }>

  return { matchupSideCount: results.length, warnings }
}
