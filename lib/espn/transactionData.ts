// Read path for /transactions: one season's synced transactions plus team names/logos keyed by
// (season, ESPN team id) -- transactions store ESPN team ids, not team row ids (migration 051).
//
// One season at a time, not every season at once: Supabase's API returns at most 1000 rows per
// request and silently drops the rest, and a season is a few hundred transactions (~300 by week 8
// of 2026), so loading every season would start losing the oldest rows around the second season.
// A single season stays well under the cap, and a week or team filter is still instant on the
// client because the whole season is handed over at once.

import { createPublicClient } from '@/lib/supabase/public'
import { teamKey, type Transaction } from '@/lib/types/transaction'
import { teamLogoOrAvatar } from '@/lib/memberAvatar'
import { FIRST_BACKFILLED_SEASON } from '@/lib/espn/firstSeason'

// PostgREST's default max rows per response. Hitting it exactly means rows were probably cut off.
const MAX_ROWS = 1000

export interface TransactionData {
  // Seasons that have ESPN data (a season with paired teams), newest first. A season with no
  // transactions yet is still listed and just shows an empty wire.
  seasons: number[]
  // The season `transactions` belongs to: the requested one if it has data, else the default.
  season: number | null
  defaultSeason: number | null
  // The selected season's teams, by name, for the team filter.
  teams: { espnTeamId: number; name: string }[]
  transactions: Transaction[]
  // Keyed `${season_year}:${espn_team_id}`. Plain objects, not Maps, so they survive the
  // Server-to-Client Component boundary.
  teamNameByKey: Record<string, string>
  teamLogoByKey: Record<string, string | null>
}

// A waiver run processes every claim within a second or so of each other (observed: executed and
// failed claims for the same run were 1-3ms apart), so a generous window still can't confuse two
// different runs, which are at least a day apart.
const SAME_RUN_WINDOW_MS = 10 * 60 * 1000

// ESPN marks a lost bid FAILED_INVALIDPLAYERSOURCE ("the player was already claimed") without
// naming who claimed them. The winner is the team whose EXECUTED waiver claim added the same
// player in the same run, so match on that.
function attachWinners(
  rows: Omit<Transaction, 'winner_espn_team_id' | 'winner_transaction_id'>[]
): Transaction[] {
  const executedAddsByPlayer = new Map<string, { teamId: number; at: number; id: string }[]>()
  for (const txn of rows) {
    if (txn.kind !== 'WAIVER' || txn.status !== 'EXECUTED') continue
    const at = Date.parse(txn.processed_at ?? txn.proposed_at)
    for (const item of txn.items) {
      if (item.action !== 'ADD') continue
      const key = `${txn.season_year}:${item.player_name}`
      const group = executedAddsByPlayer.get(key) ?? []
      group.push({ teamId: txn.espn_team_id, at, id: txn.id })
      executedAddsByPlayer.set(key, group)
    }
  }

  return rows.map((txn) => {
    let winner: { teamId: number; id: string } | null = null
    if (txn.kind === 'WAIVER' && txn.status === 'FAILED_INVALIDPLAYERSOURCE') {
      const at = Date.parse(txn.processed_at ?? txn.proposed_at)
      const added = txn.items.find((item) => item.action === 'ADD')
      const candidates = added
        ? (executedAddsByPlayer.get(`${txn.season_year}:${added.player_name}`) ?? [])
        : []
      const match = candidates.find(
        (candidate) =>
          candidate.teamId !== txn.espn_team_id && Math.abs(candidate.at - at) <= SAME_RUN_WINDOW_MS
      )
      winner = match ? { teamId: match.teamId, id: match.id } : null
    }
    return {
      ...txn,
      winner_espn_team_id: winner?.teamId ?? null,
      winner_transaction_id: winner?.id ?? null,
    }
  })
}

export async function loadTransactionData(
  requestedSeason: number | null,
  currentSeason: number
): Promise<TransactionData> {
  const empty: TransactionData = {
    seasons: [],
    season: null,
    defaultSeason: null,
    teams: [],
    transactions: [],
    teamNameByKey: {},
    teamLogoByKey: {},
  }
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project-ref')
  ) {
    return empty
  }

  const supabase = createPublicClient()

  // Teams first (a handful of rows per season): they say which seasons exist, so the season to
  // load is known before the transactions query runs.
  const teamsResult = await supabase
    .from('teams')
    .select('season_year, espn_team_id, name, owner_name, espn_logo_url')
    .not('espn_team_id', 'is', null)
  if (teamsResult.error) {
    console.error('Failed to load teams for transactions:', teamsResult.error)
    return empty
  }

  const teamNameByKey: Record<string, string> = {}
  const teamLogoByKey: Record<string, string | null> = {}
  for (const team of teamsResult.data ?? []) {
    const key = teamKey(team.season_year, team.espn_team_id as number)
    teamNameByKey[key] = team.name
    teamLogoByKey[key] = teamLogoOrAvatar(team.espn_logo_url, team.owner_name)
  }

  // Past seasons are backfilled (issue #190) without pairing their teams, so a season also counts
  // if it has any transactions. One-row probes, since selecting every season_year would hit the
  // row cap once the table grows.
  const probes = await Promise.all(
    Array.from({ length: currentSeason - FIRST_BACKFILLED_SEASON + 1 }, async (_, i) => {
      const year = currentSeason - i
      const { data } = await supabase
        .from('transactions')
        .select('season_year')
        .eq('season_year', year)
        .limit(1)
      return data?.length ? year : null
    })
  )
  const seasons = [
    ...new Set([
      ...(teamsResult.data ?? []).map((team) => team.season_year),
      ...probes.filter((year): year is number => year !== null),
    ]),
  ].sort((a, b) => b - a)
  const defaultSeason = seasons.includes(currentSeason) ? currentSeason : (seasons[0] ?? null)
  const season =
    requestedSeason !== null && seasons.includes(requestedSeason) ? requestedSeason : defaultSeason
  if (season === null) return empty

  const pairedTeams = (teamsResult.data ?? [])
    .filter((team) => team.season_year === season)
    .map((team) => ({ espnTeamId: team.espn_team_id as number, name: team.name }))

  const transactionsResult = await supabase
    .from('transactions')
    .select(
      'id, season_year, espn_transaction_id, kind, status, espn_team_id, bid_amount, week_number, proposed_at, processed_at, items'
    )
    .eq('season_year', season)
    .order('week_number', { ascending: false })

  if (transactionsResult.error) {
    console.error('Failed to load transactions:', transactionsResult.error)
  }
  const data = transactionsResult.data ?? []
  if (data.length >= MAX_ROWS) {
    // Silent data loss otherwise: the oldest weeks of the season would just not appear. The fix is
    // to page the query (or stop fetching the whole season at once) -- see the comment up top.
    console.error(
      `Transactions for ${season} returned ${data.length} rows, the API row limit; older rows are being cut off.`
    )
  }

  const rows = data.map((row) => ({
    ...row,
    // NUMERIC arrives from PostgREST as a number for numeric(6,2), but guard against a string.
    bid_amount: Number(row.bid_amount),
  })) as Omit<Transaction, 'winner_espn_team_id' | 'winner_transaction_id'>[]

  // A team with transactions but no paired row (a backfilled season) is listed as "Team N", the
  // same fallback the browser uses for names.
  const teamsById = new Map(pairedTeams.map((team) => [team.espnTeamId, team]))
  for (const row of rows) {
    if (!teamsById.has(row.espn_team_id)) {
      teamsById.set(row.espn_team_id, {
        espnTeamId: row.espn_team_id,
        name: `Team ${row.espn_team_id}`,
      })
    }
  }
  const teams = [...teamsById.values()].sort((a, b) => a.name.localeCompare(b.name))

  return {
    seasons,
    season,
    defaultSeason,
    teams,
    transactions: attachWinners(rows),
    teamNameByKey,
    teamLogoByKey,
  }
}
