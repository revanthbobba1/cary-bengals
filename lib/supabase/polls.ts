import { createPublicClient } from './public'

export interface PollTopFiveRow {
  team_id: string
  team_name: string
  final_rank: number
}

/**
 * Top-5 poll results for a locked (finalized) week, for the article page's poll cross-link.
 * Filters through the embedded `poll_weeks` join rather than a separate lookup query -- one round
 * trip instead of two. Only locked weeks are eligible, matching the public-facing "these results
 * are final" convention CommissionerPoll already establishes for the poll page itself. Returns an
 * empty array if the week isn't locked or has no results yet.
 */
export async function getPollTopFive(
  seasonYear: number,
  weekNumber: number
): Promise<PollTopFiveRow[]> {
  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('poll_results')
    .select(
      'team_id, final_rank, team:teams(name), poll_week:poll_weeks!inner(season_year, week_number, is_locked)'
    )
    .eq('poll_week.season_year', seasonYear)
    .eq('poll_week.week_number', weekNumber)
    .eq('poll_week.is_locked', true)
    .order('final_rank')
    .limit(5)

  if (error) throw error
  return (data ?? []).map((r) => ({
    team_id: r.team_id,
    team_name: (r.team as unknown as { name: string } | null)?.name ?? 'Unknown Team',
    final_rank: r.final_rank,
  }))
}
