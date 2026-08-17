import { createClient } from '@/lib/supabase/server'
import CommissionerPollClient from './CommissionerPollClient'
import type { PollResultWithTeam } from '@/lib/types/poll'

export default async function CommissionerPoll() {
  const supabase = createClient()

  // Only weeks with actual submitted results are real, viewable polls — a week
  // that's been created but has no votes yet (e.g. staged early via "Create
  // Poll Week") shouldn't appear as a dropdown choice or as the default, since
  // there's nothing to show for it. poll_results!inner(id) filters to weeks
  // with at least one result row; it produces one row per (week, result row)
  // pair, so it's deduped below to one entry per week.
  const { data: weeksWithResults, error: weeksError } = await supabase
    .from('poll_weeks')
    .select('season_year, week_number, poll_results!inner(id)')
    .order('season_year', { ascending: false })
    .order('week_number', { ascending: false })

  if (weeksError || !weeksWithResults || weeksWithResults.length === 0) {
    return <div>No poll data available</div>
  }

  const seenWeeks = new Set<string>()
  const weeks = weeksWithResults.filter((w) => {
    const key = `${w.season_year}-${w.week_number}`
    if (seenWeeks.has(key)) return false
    seenWeeks.add(key)
    return true
  })

  // Default to the newest week with real data — the most readily available poll.
  const mostRecentWeek = weeks[0]
  const { data: pollWeek } = await supabase
    .from('poll_weeks')
    .select('id')
    .eq('season_year', mostRecentWeek.season_year)
    .eq('week_number', mostRecentWeek.week_number)
    .single()

  if (!pollWeek) return <div>No poll data available</div>

  const { data: results, error: resultsError } = await supabase
    .from('poll_results')
    .select(
      `
      *,
      team:teams(*)
    `
    )
    .eq('poll_week_id', pollWeek.id)
    .order('final_rank')

  if (resultsError) {
    return <div>Error loading results</div>
  }

  // Transform data for client component
  const pollData = {
    availableYears: [...new Set(weeks.map((w) => w.season_year))],
    weeksByYear: weeks.reduce(
      (acc, w) => {
        if (!acc[w.season_year]) acc[w.season_year] = []
        acc[w.season_year].push(w.week_number)
        return acc
      },
      {} as Record<number, number[]>
    ),
    defaultYear: mostRecentWeek.season_year,
    defaultWeek: mostRecentWeek.week_number,
    defaultResults: (results as PollResultWithTeam[]) || [],
  }

  return <CommissionerPollClient {...pollData} />
}
