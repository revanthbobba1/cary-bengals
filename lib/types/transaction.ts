// Key for the team name/logo lookups: transactions store ESPN team ids, which are only unique
// within a season.
export function teamKey(seasonYear: number, espnTeamId: number): string {
  return `${seasonYear}:${espnTeamId}`
}

export interface TransactionItem {
  action: 'ADD' | 'DROP' | 'TRADE' | 'FAAB'
  player_name: string
  position: string
  pro_team: string
  // 0 means the free-agent pool.
  from_espn_team_id: number
  to_espn_team_id: number
}

// A row of the `transactions` table (migration 051), plus the one field that's derived at read
// time rather than stored.
export interface Transaction {
  id: string
  season_year: number
  espn_transaction_id: string
  kind: 'WAIVER' | 'FREEAGENT' | 'TRADE'
  // EXECUTED or a FAILED_* reason. Pending claims are never synced.
  status: string
  espn_team_id: number
  bid_amount: number
  week_number: number
  proposed_at: string
  processed_at: string | null
  items: TransactionItem[]
  // For a failed claim: the team that won the player in the same waiver run, if one can be
  // identified. ESPN doesn't say who won a contested player, so this is inferred -- see
  // lib/espn/transactionData.ts.
  winner_espn_team_id: number | null
}
