import { createClient } from '@/lib/supabase/server'
import CommissionerPollClient from './CommissionerPollClient'
import type { PollResultWithTeam } from '@/lib/types/poll'

export default async function CommissionerPoll() {
  const supabase = createClient()

  // Fetch all available years and weeks
  const { data: weeks, error: weeksError } = await supabase
    .from('poll_weeks')
    .select('season_year, week_number')
    .order('season_year', { ascending: false })
    .order('week_number', { ascending: false })

  if (weeksError || !weeks || weeks.length === 0) {
    return <div>Error loading poll data</div>
  }

  // Default to the newest *closed* week that has results, not just the newest
  // week that exists — otherwise staging next week's poll early (creating it
  // before it has any submissions) blanks the public page instead of continuing
  // to show last week's finished results. "Closed" (not just "has any results")
  // matters because recalculate_poll_results() fires on every single vote, so a
  // week with only its first ballot in would otherwise immediately look
  // "finished" and displace a genuinely complete previous week.
  const nowIso = new Date().toISOString()
  const { data: newestClosedWithResults } = await supabase
    .from('poll_weeks')
    .select('season_year, week_number, poll_results!inner(id)')
    .or(`is_locked.eq.true,deadline.lte.${nowIso}`)
    .order('season_year', { ascending: false })
    .order('week_number', { ascending: false })
    .limit(1)

  // No closed week has results yet (e.g. very start of the season) — fall back
  // to the newest week with any results at all, then to the absolute newest
  // week (which may render "no results yet" if truly nothing exists).
  const { data: newestAnyWithResults } = await supabase
    .from('poll_weeks')
    .select('season_year, week_number, poll_results!inner(id)')
    .order('season_year', { ascending: false })
    .order('week_number', { ascending: false })
    .limit(1)

  const mostRecentWeek = newestClosedWithResults?.[0] || newestAnyWithResults?.[0] || weeks[0]
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
