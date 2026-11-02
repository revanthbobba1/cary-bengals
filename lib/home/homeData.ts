// Read path for the home page's league snapshot. Each section loads independently and degrades to
// null/empty on failure, so one broken query never blanks the whole page. Deliberately lighter than
// lib/espn/scheduleData.ts: the home page needs scores and records, not per-player box scores.

import { createPublicClient } from '@/lib/supabase/public'
import { getPublishedArticles, type PublishedArticleSummary } from '@/lib/supabase/articles'
import { getPressConferences } from '@/lib/supabase/pressConferences'
import { teamLogoOrAvatar } from '@/lib/memberAvatar'
import siteMetadata from '@/data/siteMetadata'
import type { PressConference } from '@/lib/types/pressConference'
import type { TransactionItem } from '@/lib/types/transaction'

const MIN_STREAK = 3

export interface StandingsRow {
  id: string
  name: string
  logo: string | null
  wins: number
  losses: number
  ties: number
  // Current run of at least MIN_STREAK consecutive wins or losses; absent otherwise.
  streak?: { kind: 'W' | 'L'; length: number }
}

export interface SnapshotMatchup {
  id: string
  homeName: string
  awayName: string | null
  homeLogo: string | null
  awayLogo: string | null
  homeScore: number
  awayScore: number | null
  homeProjected: number | null
  awayProjected: number | null
  isBye: boolean
}

export interface PollRow {
  team_id: string
  team_name: string
  final_rank: number
  // Positive = moved up this many spots since last week, negative = moved down, 0 = no change.
  trend: number
}

export interface LatestPoll {
  seasonYear: number
  weekNumber: number
  rows: PollRow[]
  // Biggest riser(s) and faller(s) of the whole poll, not just the top 5.
  movers: { team_name: string; delta: number }[]
}

export interface TopScore {
  weekNumber: number
  teamName: string
  teamLogo: string | null
  score: number
  opponentName: string
  opponentScore: number
  won: boolean
}

export interface SnapshotTransaction {
  id: string
  teamName: string
  teamLogo: string | null
  weekNumber: number
  // Already-rendered one-liner, e.g. "Added Puka Nacua, dropped Joe Flacco ($12)".
  summary: string
}

export interface HomeSnapshot {
  latestTransactions: SnapshotTransaction[]
  latestArticle: PublishedArticleSummary | null
  recentArticles: PublishedArticleSummary[]
  latestConference: PressConference | null
  latestPoll: LatestPoll | null
  standings: StandingsRow[]
  week: number | null
  matchups: SnapshotMatchup[]
  // Highest score of the last completed week (current week - 1); null early in the season.
  topScore: TopScore | null
  lowScore: TopScore | null
}

function hasSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  return Boolean(url) && !url!.includes('your-project-ref')
}

async function settle<T>(label: string, promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise
  } catch (error) {
    console.error(`Failed to load ${label} for the home page:`, error)
    return fallback
  }
}

async function loadLatestPoll(): Promise<LatestPoll | null> {
  if (!hasSupabase()) return null
  const supabase = createPublicClient()
  // Same rule as /poll: only a locked week is public, and a locked week with no results is skipped.
  const { data, error } = await supabase
    .from('poll_weeks')
    .select('season_year, week_number, poll_results!inner(id)')
    .eq('is_locked', true)
    .order('season_year', { ascending: false })
    .order('week_number', { ascending: false })
    .limit(1)
  if (error) throw error
  const latest = data?.[0]
  if (!latest) return null
  const { data: results, error: resultsError } = await supabase
    .from('poll_results')
    .select(
      'team_id, final_rank, trend, team:teams(name), poll_week:poll_weeks!inner(season_year, week_number)'
    )
    .eq('poll_week.season_year', latest.season_year)
    .eq('poll_week.week_number', latest.week_number)
    .order('final_rank')
  if (resultsError) throw resultsError

  const all = (results ?? []).map((r) => ({
    team_id: r.team_id,
    team_name: (r.team as unknown as { name: string } | null)?.name ?? 'Unknown Team',
    final_rank: r.final_rank,
    // Stored as '↑3' / '↓2' / '-' (see the recalculate function in migration 041).
    trend: parseTrend(r.trend),
  }))
  // The whole poll, not just a top 5: it sits beside the standings card, which lists every team.
  const rows: PollRow[] = all
  const risers = all.filter((r) => r.trend > 0).sort((a, b) => b.trend - a.trend)
  const fallers = all.filter((r) => r.trend < 0).sort((a, b) => a.trend - b.trend)
  // Ties for biggest move all show: "who moved most" is a fact, not a pick of one of them.
  const movers = [
    ...risers.filter((r) => r.trend === risers[0].trend),
    ...fallers.filter((r) => r.trend === fallers[0].trend),
  ].map((r) => ({ team_name: r.team_name, delta: r.trend }))
  return { seasonYear: latest.season_year, weekNumber: latest.week_number, rows, movers }
}

// '↑3' -> 3, '↓2' -> -2, '-' or null -> 0.
function parseTrend(trend: string | null): number {
  const match = trend?.match(/^([↑↓])(\d+)$/)
  if (!match) return 0
  return (match[1] === '↑' ? 1 : -1) * Number(match[2])
}

async function loadStandingsAndMatchups(season: number): Promise<{
  standings: StandingsRow[]
  week: number | null
  matchups: SnapshotMatchup[]
  topScore: TopScore | null
  lowScore: TopScore | null
}> {
  if (!hasSupabase()) {
    return { standings: [], week: null, matchups: [], topScore: null, lowScore: null }
  }
  const supabase = createPublicClient()

  const [teamsResult, stateResult] = await Promise.all([
    supabase
      .from('teams')
      .select('id, name, owner_name, espn_logo_url, wins, losses, ties')
      .eq('season_year', season),
    supabase
      .from('espn_schedule_state')
      .select('current_week')
      .eq('season_year', season)
      .maybeSingle(),
  ])
  if (teamsResult.error) throw teamsResult.error
  if (stateResult.error) throw stateResult.error

  const teams = teamsResult.data ?? []
  const logoById = new Map(
    teams.map((t) => [t.id, teamLogoOrAvatar(t.espn_logo_url, t.owner_name)])
  )
  const nameById = new Map(teams.map((t) => [t.id, t.name]))

  const winPct = (t: { wins: number; losses: number; ties: number }) => {
    const games = t.wins + t.losses + t.ties
    return games === 0 ? 0 : (t.wins + t.ties / 2) / games
  }
  const standings = teams
    .map((t) => ({
      id: t.id,
      name: t.name,
      logo: logoById.get(t.id) ?? null,
      wins: t.wins,
      losses: t.losses,
      ties: t.ties,
    }))
    .sort((a, b) => winPct(b) - winPct(a) || b.wins - a.wins || a.name.localeCompare(b.name))

  const week = stateResult.data?.current_week ?? null
  if (week === null) return { standings, week, matchups: [], topScore: null, lowScore: null }

  const [matchupResult, pastResult] = await Promise.all([
    supabase
      .from('matchups')
      .select(
        'id, home_team_id, away_team_id, home_score, away_score, home_projected_score, away_projected_score, is_bye'
      )
      .eq('season_year', season)
      .eq('week_number', week)
      .order('espn_matchup_id'),
    // Every completed week (all final) feeds the week's high/low score and the win/loss streaks.
    // ~6 rows per week, far under the API row cap.
    week > 1
      ? supabase
          .from('matchups')
          .select('week_number, home_team_id, away_team_id, home_score, away_score')
          .eq('season_year', season)
          .lt('week_number', week)
          .eq('is_bye', false)
          .order('week_number')
      : Promise.resolve({ data: [], error: null }),
  ])
  if (matchupResult.error) throw matchupResult.error
  const matchupRows = matchupResult.data
  // A failure here shouldn't take the matchups down with it; just skip the cards that need it.
  if (pastResult.error) console.error('Failed to load completed matchups:', pastResult.error)

  // A 0-0 row is a game that was never scored/synced, not a real tie, so it must neither end a
  // streak nor show up as a "0 low score".
  const past = (pastResult.data ?? []).filter(
    (m): m is typeof m & { away_team_id: string; away_score: number } =>
      m.away_team_id !== null &&
      m.away_score !== null &&
      !(m.home_score === 0 && m.away_score === 0)
  )

  // High/low across every team's score last week. The high always belongs to a winner and the low
  // to a loser (barring ties), so `won` on each line is just a display convenience.
  const lastWeekSides = past
    .filter((m) => m.week_number === week - 1)
    .flatMap((m) => [
      { id: m.home_team_id, score: m.home_score, oppId: m.away_team_id, oppScore: m.away_score },
      { id: m.away_team_id, score: m.away_score, oppId: m.home_team_id, oppScore: m.home_score },
    ])
  const toScoreLine = (side: (typeof lastWeekSides)[number]): TopScore => ({
    weekNumber: week - 1,
    teamName: nameById.get(side.id) ?? 'Unknown Team',
    teamLogo: logoById.get(side.id) ?? null,
    score: side.score,
    opponentName: nameById.get(side.oppId) ?? 'Unknown Team',
    opponentScore: side.oppScore,
    won: side.score > side.oppScore,
  })
  const byScore = [...lastWeekSides].sort((a, b) => b.score - a.score)
  const topScore = byScore.length ? toScoreLine(byScore[0]) : null
  const lowScore = byScore.length ? toScoreLine(byScore[byScore.length - 1]) : null

  // Current streak per team: walk its games newest-first until the result changes. A tie ends
  // the streak (and isn't one itself).
  const resultsByTeam = new Map<string, ('W' | 'L' | 'T')[]>()
  for (const m of past) {
    const home = m.home_score > m.away_score ? 'W' : m.home_score < m.away_score ? 'L' : 'T'
    const away = home === 'W' ? 'L' : home === 'L' ? 'W' : 'T'
    resultsByTeam.set(m.home_team_id, [...(resultsByTeam.get(m.home_team_id) ?? []), home])
    resultsByTeam.set(m.away_team_id, [...(resultsByTeam.get(m.away_team_id) ?? []), away])
  }
  const standingsWithStreaks = standings.map((team) => {
    const results = resultsByTeam.get(team.id) ?? []
    const last = results[results.length - 1]
    if (!last || last === 'T') return team
    let length = 0
    for (let i = results.length - 1; i >= 0 && results[i] === last; i--) length++
    // Shorter runs are noise on a snapshot, so they're not surfaced at all.
    return length >= MIN_STREAK ? { ...team, streak: { kind: last, length } } : team
  })

  const matchups = (matchupRows ?? []).map((m) => ({
    id: m.id,
    homeName: nameById.get(m.home_team_id) ?? 'Unknown Team',
    awayName: m.away_team_id ? (nameById.get(m.away_team_id) ?? 'Unknown Team') : null,
    homeLogo: logoById.get(m.home_team_id) ?? null,
    awayLogo: m.away_team_id ? (logoById.get(m.away_team_id) ?? null) : null,
    homeScore: m.home_score,
    awayScore: m.away_score,
    homeProjected: m.home_projected_score,
    awayProjected: m.away_projected_score,
    isBye: m.is_bye,
  }))
  return { standings: standingsWithStreaks, week, matchups, topScore, lowScore }
}

const TRANSACTION_LIMIT = 5

// Newest executed moves only -- failed claims are noise on a snapshot. /transactions has the full
// wire including failures.
async function loadLatestTransactions(season: number): Promise<SnapshotTransaction[]> {
  if (!hasSupabase()) return []
  const supabase = createPublicClient()
  const columns =
    'id, kind, espn_team_id, bid_amount, week_number, processed_at, proposed_at, items'
  // Free-agent pickups have no processed_at (only waivers and trades do), so neither column
  // orders every kind on its own. /transactions sorts by `processed_at ?? proposed_at`; to match
  // that, take the newest few of each group and merge. A sort on one column would hide the newest
  // free-agent moves behind older waivers.
  const [teamsResult, processedResult, unprocessedResult] = await Promise.all([
    supabase
      .from('teams')
      .select('espn_team_id, name, owner_name, espn_logo_url')
      .eq('season_year', season)
      .not('espn_team_id', 'is', null),
    supabase
      .from('transactions')
      .select(columns)
      .eq('season_year', season)
      .eq('status', 'EXECUTED')
      .not('processed_at', 'is', null)
      .order('processed_at', { ascending: false })
      .limit(TRANSACTION_LIMIT),
    supabase
      .from('transactions')
      .select(columns)
      .eq('season_year', season)
      .eq('status', 'EXECUTED')
      .is('processed_at', null)
      .order('proposed_at', { ascending: false })
      .limit(TRANSACTION_LIMIT),
  ])
  if (teamsResult.error) throw teamsResult.error
  if (processedResult.error) throw processedResult.error
  if (unprocessedResult.error) throw unprocessedResult.error

  const happenedAt = (txn: { processed_at: string | null; proposed_at: string }) =>
    Date.parse(txn.processed_at ?? txn.proposed_at)
  const txnResult = {
    data: [...(processedResult.data ?? []), ...(unprocessedResult.data ?? [])]
      .sort((a, b) => happenedAt(b) - happenedAt(a))
      .slice(0, TRANSACTION_LIMIT),
  }

  const teamById = new Map(
    (teamsResult.data ?? []).map((t) => [
      t.espn_team_id as number,
      { name: t.name, logo: teamLogoOrAvatar(t.espn_logo_url, t.owner_name) },
    ])
  )
  const nameOf = (id: number) => teamById.get(id)?.name ?? `Team ${id}`

  return (txnResult.data ?? []).map((txn) => {
    const items = (txn.items ?? []) as TransactionItem[]
    let summary: string
    if (txn.kind === 'TRADE') {
      const partners = [
        ...new Set(
          items
            .flatMap((i) => [i.from_espn_team_id, i.to_espn_team_id])
            .filter((id) => id !== 0 && id !== txn.espn_team_id)
        ),
      ].map(nameOf)
      const players = items.filter((i) => i.action === 'TRADE').map((i) => i.player_name)
      summary = `Traded with ${partners.join(' & ') || 'another team'}${
        players.length ? `: ${players.join(', ')}` : ''
      }`
    } else {
      const added = items.filter((i) => i.action === 'ADD').map((i) => i.player_name)
      const dropped = items.filter((i) => i.action === 'DROP').map((i) => i.player_name)
      const bid =
        txn.kind === 'WAIVER' && Number(txn.bid_amount) > 0 ? ` ($${Number(txn.bid_amount)})` : ''
      summary =
        [
          added.length ? `Added ${added.join(', ')}${bid}` : '',
          dropped.length ? `dropped ${dropped.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join(', ') || 'Roster move'
    }
    return {
      id: txn.id,
      teamName: nameOf(txn.espn_team_id),
      teamLogo: teamById.get(txn.espn_team_id)?.logo ?? null,
      weekNumber: txn.week_number,
      summary,
    }
  })
}

export async function loadHomeSnapshot(): Promise<HomeSnapshot> {
  const [articles, conferences, latestPoll, league, latestTransactions] = await Promise.all([
    settle('articles', getPublishedArticles(), [] as PublishedArticleSummary[]),
    settle(
      'press conferences',
      hasSupabase() ? getPressConferences() : Promise.resolve([] as PressConference[]),
      [] as PressConference[]
    ),
    settle('poll', loadLatestPoll(), null),
    settle('standings and matchups', loadStandingsAndMatchups(siteMetadata.currentSeason), {
      standings: [] as StandingsRow[],
      week: null,
      matchups: [] as SnapshotMatchup[],
      topScore: null as TopScore | null,
      lowScore: null as TopScore | null,
    }),
    settle(
      'transactions',
      loadLatestTransactions(siteMetadata.currentSeason),
      [] as SnapshotTransaction[]
    ),
  ])

  return {
    latestTransactions,
    latestArticle: articles[0] ?? null,
    recentArticles: articles.slice(1, 4),
    latestConference: conferences[0] ?? null,
    latestPoll,
    ...league,
  }
}
