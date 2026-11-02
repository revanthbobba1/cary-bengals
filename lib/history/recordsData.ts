// Read path for the Records and Transactions tabs of /history (issue #194). Every list is a
// `limit`ed, ordered slice of a view from migration 052, so none of it is near the 1000-row cap.

import { createPublicClient } from '@/lib/supabase/public'
import { num } from '@/lib/history/historyData'

const LIST_SIZE = 10

export interface GameRecord {
  season_year: number
  week_number: number
  is_playoffs: boolean
  owner_name: string
  team_name: string
  opp_owner_name: string
  opp_team_name: string
  pf: number
  pa: number
  margin: number
}

export interface Streak {
  owner_name: string
  length: number
  startSeason: number
  startWeek: number
  endSeason: number
  endWeek: number
}

export interface PlayerGame {
  season_year: number
  week_number: number
  player_name: string
  position: string
  owner_name: string
  team_name: string
  points: number
}

export interface BenchWeek {
  season_year: number
  week_number: number
  owner_name: string
  team_name: string
  bench_points: number
}

export interface HeadToHead {
  owner_id: string
  opp_owner_id: string
  owner_name: string
  opp_owner_name: string
  wins: number
  losses: number
  ties: number
}

export interface RecordsData {
  highScores: GameRecord[]
  lowScores: GameRecord[]
  blowouts: GameRecord[]
  closest: GameRecord[]
  winStreaks: Streak[]
  lossStreaks: Streak[]
  playerGames: PlayerGame[]
  benchWeeks: BenchWeek[]
  headToHead: HeadToHead[]
}

function toGameRecord(row: Record<string, unknown>): GameRecord {
  return {
    season_year: row.season_year as number,
    week_number: row.week_number as number,
    is_playoffs: row.is_playoffs as boolean,
    owner_name: row.owner_name as string,
    team_name: row.team_name as string,
    opp_owner_name: row.opp_owner_name as string,
    opp_team_name: row.opp_team_name as string,
    pf: num(row.pf),
    pa: num(row.pa),
    margin: num(row.margin),
  }
}

function toStreak(row: Record<string, unknown>): Streak {
  const start = num(row.start_key)
  const end = num(row.end_key)
  return {
    owner_name: row.owner_name as string,
    length: num(row.length),
    startSeason: Math.floor(start / 100),
    startWeek: start % 100,
    endSeason: Math.floor(end / 100),
    endWeek: end % 100,
  }
}

export async function loadRecords(): Promise<RecordsData | null> {
  const supabase = createPublicClient()
  const games = () => supabase.from('league_games').select('*')

  const results = await Promise.all([
    games().order('pf', { ascending: false }).limit(LIST_SIZE),
    games().order('pf', { ascending: true }).limit(LIST_SIZE),
    // Each game appears once per side; the winner's side carries the positive margin.
    games().eq('result', 'W').order('margin', { ascending: false }).limit(LIST_SIZE),
    games().eq('result', 'W').order('margin', { ascending: true }).limit(LIST_SIZE),
    supabase
      .from('league_streaks')
      .select('*')
      .eq('result', 'W')
      .order('length', { ascending: false })
      .limit(5),
    supabase
      .from('league_streaks')
      .select('*')
      .eq('result', 'L')
      .order('length', { ascending: false })
      .limit(5),
    supabase
      .from('league_player_games')
      .select('season_year, week_number, player_name, position, owner_name, team_name, points')
      .eq('is_starter', true)
      .order('points', { ascending: false })
      .limit(LIST_SIZE),
    supabase
      .from('league_bench_weeks')
      .select('season_year, week_number, owner_name, team_name, bench_points')
      .order('bench_points', { ascending: false })
      .limit(LIST_SIZE),
    supabase
      .from('league_h2h')
      .select('owner_id, opp_owner_id, owner_name, opp_owner_name, wins, losses, ties'),
  ])
  const failed = results.find((result) => result.error)
  if (failed) {
    console.error('Failed to load league records:', failed.error)
    return null
  }
  const [high, low, blowouts, closest, winStreaks, lossStreaks, players, bench, h2h] = results.map(
    (result) => (result.data ?? []) as Record<string, unknown>[]
  )

  return {
    highScores: high.map(toGameRecord),
    lowScores: low.map(toGameRecord),
    blowouts: blowouts.map(toGameRecord),
    closest: closest.map(toGameRecord),
    winStreaks: winStreaks.map(toStreak),
    lossStreaks: lossStreaks.map(toStreak),
    playerGames: players.map((row) => ({
      season_year: row.season_year as number,
      week_number: row.week_number as number,
      player_name: row.player_name as string,
      position: row.position as string,
      owner_name: row.owner_name as string,
      team_name: row.team_name as string,
      points: num(row.points),
    })),
    benchWeeks: bench.map((row) => ({
      season_year: row.season_year as number,
      week_number: row.week_number as number,
      owner_name: row.owner_name as string,
      team_name: row.team_name as string,
      bench_points: num(row.bench_points),
    })),
    headToHead: h2h.map((row) => ({
      owner_id: row.owner_id as string,
      opp_owner_id: row.opp_owner_id as string,
      owner_name: row.owner_name as string,
      opp_owner_name: row.opp_owner_name as string,
      wins: num(row.wins),
      losses: num(row.losses),
      ties: num(row.ties),
    })),
  }
}

export interface OwnerTransactions {
  owner_name: string
  waiver_claims: number
  claims_won: number
  claims_lost: number
  faab_spent: number
  free_agent_pickups: number
  trades: number
}

export interface BigBid {
  season_year: number
  week_number: number
  team_name: string
  owner_name: string
  bid_amount: number
  player_name: string
}

export interface TransactionStats {
  owners: OwnerTransactions[]
  biggestBids: BigBid[]
}

export async function loadTransactionStats(): Promise<TransactionStats | null> {
  const supabase = createPublicClient()
  const [ownersResult, bidsResult, teamsResult] = await Promise.all([
    supabase.from('league_owner_transactions').select('*'),
    supabase
      .from('transactions')
      .select('season_year, week_number, espn_team_id, bid_amount, items')
      .eq('kind', 'WAIVER')
      .eq('status', 'EXECUTED')
      .order('bid_amount', { ascending: false })
      .limit(LIST_SIZE),
    supabase
      .from('teams')
      .select('season_year, espn_team_id, name, owner_name')
      .not('espn_team_id', 'is', null)
      .limit(1000),
  ])
  const failed = [ownersResult, bidsResult, teamsResult].find((result) => result.error)
  if (failed) {
    console.error('Failed to load transaction stats:', failed.error)
    return null
  }

  const teamByKey = new Map(
    (teamsResult.data ?? []).map((team) => [`${team.season_year}:${team.espn_team_id}`, team])
  )
  return {
    owners: (ownersResult.data ?? []).map((row) => ({
      owner_name: row.owner_name,
      waiver_claims: num(row.waiver_claims),
      claims_won: num(row.claims_won),
      claims_lost: num(row.claims_lost),
      faab_spent: num(row.faab_spent),
      free_agent_pickups: num(row.free_agent_pickups),
      trades: num(row.trades),
    })),
    biggestBids: (bidsResult.data ?? []).map((row) => {
      const team = teamByKey.get(`${row.season_year}:${row.espn_team_id}`)
      const added = (row.items as { action: string; player_name: string }[]).find(
        (item) => item.action === 'ADD'
      )
      return {
        season_year: row.season_year,
        week_number: row.week_number,
        team_name: team?.name ?? `Team ${row.espn_team_id}`,
        owner_name: team?.owner_name ?? '',
        bid_amount: num(row.bid_amount),
        player_name: added?.player_name ?? 'Unknown player',
      }
    }),
  }
}
