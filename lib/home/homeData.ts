// Read path for the home page's league snapshot. Each section loads independently and degrades to
// null/empty on failure, so one broken query never blanks the whole page. Deliberately lighter than
// lib/espn/scheduleData.ts: the home page needs scores and records, not per-player box scores.

import { createPublicClient } from '@/lib/supabase/public'
import { getPublishedArticles, type PublishedArticleSummary } from '@/lib/supabase/articles'
import { getPressConferences } from '@/lib/supabase/pressConferences'
import { teamLogoOrAvatar } from '@/lib/memberAvatar'
import siteMetadata from '@/data/siteMetadata'
import { computeWeeklyAwards, type Award } from '@/lib/awards/weeklyAwards'
import type { MatchupPlayerScore } from '@/lib/types/matchup'
import type { PressConference } from '@/lib/types/pressConference'
import type { TransactionItem } from '@/lib/types/transaction'
import { computePlayoffOdds, type OddsGame, type TeamOdds } from '@/lib/playoffs/odds'

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
  // Playoff picture from the remaining regular-season schedule; absent before the schedule syncs.
  odds?: Omit<TeamOdds, 'teamId'>
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

export interface WeekAwards {
  weekNumber: number
  awards: Award[]
  teamLogoById: Record<string, string | null>
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
  // Awards for the last completed week (current week - 1); null early in the season.
  awards: WeekAwards | null
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

// Awards for one finished week. Needs the week's box scores for the bench/player awards, so it
// does its own two small reads (~6 matchups, ~190 player rows) rather than widening the
// every-completed-week query the streaks use.
async function loadLastWeekAwards(
  supabase: ReturnType<typeof createPublicClient>,
  season: number,
  weekNumber: number,
  nameById: Map<string, string>,
  logoById: Map<string, string | null>
): Promise<WeekAwards | null> {
  if (weekNumber < 1) return null
  const { data: rows, error } = await supabase
    .from('matchups')
    .select('id, is_bye, home_team_id, away_team_id, home_score, away_score')
    .eq('season_year', season)
    .eq('week_number', weekNumber)
  if (error) throw error
  if (!rows?.length) return null

  // A failure here only costs the box-score awards; the score-based ones still render.
  const { data: playerRows, error: playersError } = await supabase
    .from('matchup_player_scores')
    .select(
      'id, matchup_id, team_side, player_name, position, pro_team, lineup_slot, is_starter, points, sort_order'
    )
    .in(
      'matchup_id',
      rows.map((m) => m.id)
    )
  if (playersError) console.error('Failed to load player scores for awards:', playersError)

  const playersBySide = new Map<string, MatchupPlayerScore[]>()
  for (const row of playersError ? [] : (playerRows ?? [])) {
    const key = `${row.matchup_id}:${row.team_side}`
    const group = playersBySide.get(key) ?? []
    // Awards only read these fields; the stat breakdown/availability aren't needed here.
    group.push({ ...row, stat_breakdown: {}, availability: null } as MatchupPlayerScore)
    playersBySide.set(key, group)
  }

  const awards = computeWeeklyAwards(
    rows.map((m) => ({
      ...m,
      home_player_scores: playersBySide.get(`${m.id}:home`) ?? null,
      away_player_scores: playersBySide.get(`${m.id}:away`) ?? null,
    })),
    Object.fromEntries(nameById)
  )
  if (awards.length === 0) return null
  return { weekNumber, awards, teamLogoById: Object.fromEntries(logoById) }
}

async function loadStandingsAndMatchups(season: number): Promise<{
  standings: StandingsRow[]
  week: number | null
  matchups: SnapshotMatchup[]
  awards: WeekAwards | null
}> {
  if (!hasSupabase()) {
    return { standings: [], week: null, matchups: [], awards: null }
  }
  const supabase = createPublicClient()

  const [teamsResult, stateResult, scheduleResult] = await Promise.all([
    supabase
      .from('teams')
      .select('id, name, owner_name, espn_logo_url, wins, losses, ties')
      .eq('season_year', season),
    supabase
      .from('espn_schedule_state')
      .select('current_week')
      .eq('season_year', season)
      .maybeSingle(),
    // The whole regular season (~84 rows): finished games give points for, the rest are what the
    // playoff odds simulate.
    supabase
      .from('matchups')
      .select('home_team_id, away_team_id, home_score, away_score, winner')
      .eq('season_year', season)
      .eq('is_playoffs', false)
      .eq('is_bye', false),
  ])
  if (teamsResult.error) throw teamsResult.error
  if (stateResult.error) throw stateResult.error
  // Odds are an extra: if this read fails the standings still render without them.
  if (scheduleResult.error)
    console.error('Failed to load the season schedule:', scheduleResult.error)

  const teams = teamsResult.data ?? []
  const logoById = new Map(
    teams.map((t) => [t.id, teamLogoOrAvatar(t.espn_logo_url, t.owner_name)])
  )
  const nameById = new Map(teams.map((t) => [t.id, t.name]))

  const winPct = (t: { wins: number; losses: number; ties: number }) => {
    const games = t.wins + t.losses + t.ties
    return games === 0 ? 0 : (t.wins + t.ties / 2) / games
  }
  // A 0-0 row is a game that was never scored/synced, so it stays unplayed.
  const games: OddsGame[] = (scheduleResult.data ?? []).flatMap((m) =>
    m.away_team_id === null || m.away_score === null
      ? []
      : [
          {
            homeTeamId: m.home_team_id,
            awayTeamId: m.away_team_id,
            isFinal: m.winner !== 'UNDECIDED' && !(m.home_score === 0 && m.away_score === 0),
            homeScore: Number(m.home_score),
            awayScore: Number(m.away_score),
          },
        ]
  )
  const pointsFor = new Map<string, number>()
  for (const g of games) {
    if (!g.isFinal) continue
    pointsFor.set(g.homeTeamId, (pointsFor.get(g.homeTeamId) ?? 0) + g.homeScore)
    pointsFor.set(g.awayTeamId, (pointsFor.get(g.awayTeamId) ?? 0) + g.awayScore)
  }
  const oddsById = new Map(
    games.length
      ? computePlayoffOdds(
          teams.map((t) => t.id),
          games
        ).map(({ teamId, ...odds }) => [teamId, odds])
      : []
  )
  // Win % then points for, the same order as the League History standings.
  const standings: StandingsRow[] = teams
    .map((t) => ({
      id: t.id,
      name: t.name,
      logo: logoById.get(t.id) ?? null,
      wins: t.wins,
      losses: t.losses,
      ties: t.ties,
      odds: oddsById.get(t.id),
    }))
    .sort(
      (a, b) =>
        winPct(b) - winPct(a) ||
        (pointsFor.get(b.id) ?? 0) - (pointsFor.get(a.id) ?? 0) ||
        a.name.localeCompare(b.name)
    )

  const week = stateResult.data?.current_week ?? null
  if (week === null) return { standings, week, matchups: [], awards: null }

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

  const awards = await loadLastWeekAwards(supabase, season, week - 1, nameById, logoById).catch(
    (error) => {
      console.error('Failed to load weekly awards for the home page:', error)
      return null
    }
  )

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
  return { standings: standingsWithStreaks, week, matchups, awards }
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
      awards: null as WeekAwards | null,
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
