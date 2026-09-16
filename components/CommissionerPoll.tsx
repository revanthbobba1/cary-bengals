import { createClient } from '@/lib/supabase/server'
import CommissionerPollClient from './CommissionerPollClient'
import type { PollResultWithTeam } from '@/lib/types/poll'

const localTeams = [
  ['local-team-1', 'Bark For Daddy!🫵🐶', 'Kirk'],
  ['local-team-2', 'Code Monkey', 'Ankith'],
  ['local-team-3', 'Kamara vs the World', 'Amogh'],
] as const

function localResults(year: number, week: number): PollResultWithTeam[] {
  return localTeams.map(([id, name, owner_name], index) => ({
    id: `local-result-${year}-${week}-${index + 1}`,
    poll_week_id: `local-week-${year}-${week}`,
    team_id: id,
    final_rank: index + 1,
    avg_rank_score: index + 1.5,
    team_record: `${Math.max(0, 3 - index)}-${index}`,
    trend: index === 0 ? '↑1' : '-',
    num_ballots: 12,
    created_at: `${year}-09-01T00:00:00.000Z`,
    team: {
      id,
      name,
      owner_name,
      season_year: year,
      espn_team_id: null,
      espn_owner_id: null,
      espn_synced_at: null,
      created_at: `${year}-09-01T00:00:00.000Z`,
      updated_at: `${year}-09-01T00:00:00.000Z`,
    },
  }))
}

const localFixtureData = {
  availableYears: [2026, 2025],
  weeksByYear: { 2026: [2, 1], 2025: [3, 2, 1] },
  defaultYear: 2026,
  defaultWeek: 2,
  defaultResults: localResults(2026, 2),
  localFixtures: {
    '2026-2': localResults(2026, 2),
    '2026-1': localResults(2026, 1),
    '2025-3': localResults(2025, 3),
    '2025-2': localResults(2025, 2),
    '2025-1': localResults(2025, 1),
  },
}

export default async function CommissionerPoll() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project-ref')) {
    return <CommissionerPollClient {...localFixtureData} />
  }

  const supabase = createClient()

  // Only show weeks the commissioner has explicitly locked — that's the
  // deliberate "these results are final" signal in this app, independent of how
  // many of the ~12 members actually voted (a locked week with partial
  // participation is still meant to be public; an unlocked week isn't, even
  // with full participation). poll_results!inner(id) additionally excludes a
  // locked-but-empty week (e.g. locked before anyone voted) — it produces one
  // row per (week, result row) pair, so it's deduped below to one entry per week.
  const { data: weeksWithResults, error: weeksError } = await supabase
    .from('poll_weeks')
    .select('season_year, week_number, poll_results!inner(id)')
    .eq('is_locked', true)
    .order('season_year', { ascending: false })
    .order('week_number', { ascending: false })

  if (weeksError) {
    return (
      <div className="rounded-card border border-gray-200 bg-white p-8 text-center text-gray-500 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:shadow-card-dark">
        Error loading poll data
      </div>
    )
  }

  if (!weeksWithResults || weeksWithResults.length === 0) {
    return (
      <div className="rounded-card border border-gray-200 bg-white p-8 text-center text-gray-500 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:shadow-card-dark">
        No poll results have been finalized yet — check back once the commissioner locks a week.
      </div>
    )
  }

  const seenWeeks = new Set<string>()
  const weeks = weeksWithResults.filter((w) => {
    const key = `${w.season_year}-${w.week_number}`
    if (seenWeeks.has(key)) return false
    seenWeeks.add(key)
    return true
  })

  // Default to the newest locked (finalized) week.
  const mostRecentWeek = weeks[0]
  const { data: pollWeek } = await supabase
    .from('poll_weeks')
    .select('id')
    .eq('season_year', mostRecentWeek.season_year)
    .eq('week_number', mostRecentWeek.week_number)
    .single()

  if (!pollWeek)
    return (
      <div className="rounded-card border border-gray-200 bg-white p-8 text-center text-gray-500 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:shadow-card-dark">
        No poll data available
      </div>
    )

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
    return (
      <div className="rounded-card border border-gray-200 bg-white p-8 text-center text-gray-500 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:shadow-card-dark">
        Error loading results
      </div>
    )
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
