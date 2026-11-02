// Transaction-wire sync, same shape as matchupSync.ts/teamRecordSync.ts so it can be called from
// both the commissioner's combined "Refresh ESPN Data" button and the cron-triggered full sync (via
// refreshAll.ts). Unlike those, it needs no `teams` lookup: transactions are stored with ESPN team
// ids and joined to `teams` at read time (see migration 051), so an unpaired team can't make a
// transaction fail to sync.

import type { createClient } from '@/lib/supabase/server'
import { fetchEspnTransactions, type EspnLeagueTransactionsResponse } from '@/lib/espn/client'

type SupabaseServerClient = ReturnType<typeof createClient>

export interface TransactionSyncResult {
  transactionCount: number
  warnings: string[]
}

export async function syncTransactions(
  supabase: SupabaseServerClient,
  seasonYear: number,
  espnResponse?: EspnLeagueTransactionsResponse
): Promise<TransactionSyncResult> {
  espnResponse ??= await fetchEspnTransactions(seasonYear)

  const payload = espnResponse.transactions.map((txn) => ({
    espn_transaction_id: txn.espn_transaction_id,
    kind: txn.kind,
    status: txn.status,
    espn_team_id: txn.espn_team_id,
    bid_amount: txn.bid_amount,
    week_number: txn.week,
    proposed_at: txn.proposed_at,
    processed_at: txn.processed_at,
    items: txn.items,
  }))

  const { data, error } = await supabase.rpc('sync_transactions', {
    p_season_year: seasonYear,
    p_transactions: payload,
  })
  if (error) throw new Error(error.message)

  const results = data as Array<{ espn_transaction_id: string; updated: boolean }>
  const transactionCount = results.filter((row) => row.updated).length

  return { transactionCount, warnings: espnResponse.warnings }
}
