// Read path for /transactions: every synced transaction across seasons plus team names/logos keyed
// by (season, ESPN team id) -- transactions store ESPN team ids, not team row ids (migration 051).
// Small enough (tens of rows per season) to hand to the client whole for instant filtering, same
// reasoning as /schedule's week selector.

import { createPublicClient } from '@/lib/supabase/public'
import { teamKey, type Transaction } from '@/lib/types/transaction'
import { teamLogoOrAvatar } from '@/lib/memberAvatar'

export interface TransactionData {
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

export async function loadTransactionData(): Promise<TransactionData> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project-ref')
  ) {
    return { transactions: [], teamNameByKey: {}, teamLogoByKey: {} }
  }

  const supabase = createPublicClient()

  const [transactionsResult, teamsResult] = await Promise.all([
    supabase
      .from('transactions')
      .select(
        'id, season_year, espn_transaction_id, kind, status, espn_team_id, bid_amount, week_number, proposed_at, processed_at, items'
      )
      .order('season_year', { ascending: false })
      .order('week_number', { ascending: false }),
    supabase
      .from('teams')
      .select('season_year, espn_team_id, name, owner_name, espn_logo_url')
      .not('espn_team_id', 'is', null),
  ])

  if (transactionsResult.error) {
    console.error('Failed to load transactions:', transactionsResult.error)
  }
  if (teamsResult.error) {
    console.error('Failed to load teams for transactions:', teamsResult.error)
  }

  const teamNameByKey: Record<string, string> = {}
  const teamLogoByKey: Record<string, string | null> = {}
  for (const team of teamsResult.data ?? []) {
    const key = teamKey(team.season_year, team.espn_team_id as number)
    teamNameByKey[key] = team.name
    teamLogoByKey[key] = teamLogoOrAvatar(team.espn_logo_url, team.owner_name)
  }

  const rows = (transactionsResult.data ?? []).map((row) => ({
    ...row,
    // NUMERIC arrives from PostgREST as a number for numeric(6,2), but guard against a string.
    bid_amount: Number(row.bid_amount),
  })) as Omit<Transaction, 'winner_espn_team_id' | 'winner_transaction_id'>[]

  return { transactions: attachWinners(rows), teamNameByKey, teamLogoByKey }
}
