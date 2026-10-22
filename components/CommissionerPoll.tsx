import { createClient } from '@/lib/supabase/server'
import { allAuthors } from 'contentlayer/generated'
import CommissionerPollClient from './CommissionerPollClient'
import { normalizeOwnerKey, type PollHistoryRow } from '@/lib/pollChart'
import type { PollResultWithTeam } from '@/lib/types/poll'

// Keeps the public poll page usable while styling/testing locally before a Supabase project is
// available. This is deliberately development-only; production still fails visibly if its data
// connection is misconfigured instead of silently showing fake content (see the matching
// useLocalArticleFixtures() in lib/supabase/articles.ts for the same pattern).
function useLocalPollFixtures() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const isPlaceholder = !url || url.includes('your-project-ref')
  return process.env.NODE_ENV !== 'production' && isPlaceholder
}

// 12 teams, like the real league, so the poll chart's layout can be checked at realistic size.
// Owners reuse the league members' first names so their avatars resolve.
const localTeams = [
  ['Bark For Daddy!🫵🐶', 'Kirk'],
  ['Code Monkey', 'Ankith'],
  ['Kamara vs the World', 'Amogh'],
  ['Touchdown Tacos', 'Alvin'],
  ['Gridiron Goblins', 'Carter'],
  ['Hail Mary Hustlers', 'Joseph'],
  ['Blitz Krieg', 'Keshav'],
  ['Pocket Aces', 'Revanth'],
  ['Fourth & Long', 'Rishi'],
  ['The Waiver Wire', 'Sam'],
  ['Red Zone Rascals', 'Sparsh'],
  ['Punt Intended', 'TJ'],
] as const

const LOCAL_WEEKS: Record<number, number> = { 2026: 6, 2025: 3 }
// Odd multipliers coprime with 12, so each week is a different permutation of the 12 teams.
const RANK_MULTIPLIERS = [1, 5, 7, 11, 5, 7]

// Deterministic ranks for the fixture; weeks 4 and 6 have two ties (rank 4 and rank 8) to exercise the
// chart's tied-rank layout.
function localRank(index: number, week: number) {
  const rank = ((index * RANK_MULTIPLIERS[(week - 1) % RANK_MULTIPLIERS.length] + week) % 12) + 1
  if ((week === 4 || week === 6) && rank === 5) return 4
  if ((week === 4 || week === 6) && rank === 9) return 8
  return rank
}

function localResults(year: number, week: number): PollResultWithTeam[] {
  return localTeams
    .map(([name, owner_name], index) => {
      const id = `local-team-${index + 1}`
      const rank = localRank(index, week)
      return {
        id: `local-result-${year}-${week}-${index + 1}`,
        poll_week_id: `local-week-${year}-${week}`,
        team_id: id,
        final_rank: rank,
        avg_rank_score: rank + 0.5,
        team_record: `${Math.max(0, week - (rank % 4))}-${rank % 4}`,
        trend: week === 1 ? '-' : '↑1',
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
          wins: Math.max(0, week - (rank % 4)),
          losses: rank % 4,
          ties: 0,
          created_at: `${year}-09-01T00:00:00.000Z`,
          updated_at: `${year}-09-01T00:00:00.000Z`,
        },
      }
    })
    .sort((a, b) => a.final_rank - b.final_rank)
}

// Owners are matched to league members by first name, the same way /league-members pairs teams.
const avatarByOwner = Object.fromEntries(
  allAuthors.filter((a) => a.avatar).map((a) => [normalizeOwnerKey(a.name), a.avatar as string])
)

const localYears = Object.keys(LOCAL_WEEKS)
  .map(Number)
  .sort((a, b) => b - a)
const localWeekList = (year: number) =>
  Array.from({ length: LOCAL_WEEKS[year] }, (_, i) => LOCAL_WEEKS[year] - i)

const localHistory: PollHistoryRow[] = localYears.flatMap((year) =>
  localWeekList(year).flatMap((week) =>
    localResults(year, week).map((r) => ({
      season_year: year,
      week_number: week,
      final_rank: r.final_rank,
      team_name: r.team.name,
      owner_name: r.team.owner_name,
    }))
  )
)

const localFixtureData = {
  avatarByOwner,
  history: localHistory,
  availableYears: localYears,
  weeksByYear: Object.fromEntries(localYears.map((y) => [y, localWeekList(y)])),
  defaultYear: localYears[0],
  defaultWeek: LOCAL_WEEKS[localYears[0]],
  defaultResults: localResults(localYears[0], LOCAL_WEEKS[localYears[0]]),
  localFixtures: Object.fromEntries(
    localYears.flatMap((y) => localWeekList(y).map((w) => [`${y}-${w}`, localResults(y, w)]))
  ),
}

export default async function CommissionerPoll() {
  if (useLocalPollFixtures()) {
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

  // One query for every finalized week so the rank-over-time chart needs no client fetching.
  const { data: historyRows } = await supabase
    .from('poll_results')
    .select(
      'final_rank, team:teams(name, owner_name), poll_week:poll_weeks!inner(season_year, week_number, is_locked)'
    )
    .eq('poll_week.is_locked', true)

  const history: PollHistoryRow[] = (historyRows ?? []).flatMap((r) => {
    const team = r.team as unknown as { name: string; owner_name: string } | null
    const week = r.poll_week as unknown as { season_year: number; week_number: number } | null
    if (!team || !week) return []
    return [
      {
        season_year: week.season_year,
        week_number: week.week_number,
        final_rank: r.final_rank,
        team_name: team.name,
        owner_name: team.owner_name,
      },
    ]
  })

  // Transform data for client component
  const pollData = {
    avatarByOwner,
    history,
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
