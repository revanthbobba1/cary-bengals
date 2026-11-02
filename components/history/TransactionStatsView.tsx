import type { TransactionStats } from '@/lib/history/recordsData'

export default function TransactionStatsView({ stats }: { stats: TransactionStats }) {
  const owners = [...stats.owners].sort((a, b) => b.waiver_claims - a.waiver_claims)
  return (
    <div className="space-y-10">
      <p className="rounded border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-gray-700 dark:text-gray-300">
        Trade totals are incomplete for past seasons. ESPN does not return most trades from earlier
        years, so only a few are included. Waiver and free agent totals are complete.
      </p>
      <section>
        <h2 className="pb-3 text-xl font-bold text-ink dark:text-gray-100">Owners by activity</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 pr-2">Owner</th>
                <th className="py-2 pr-2 text-right">Claims</th>
                <th className="py-2 pr-2 text-right">Won</th>
                <th className="py-2 pr-2 text-right">Lost to another bid</th>
                <th className="py-2 pr-2 text-right">FAAB spent</th>
                <th className="py-2 pr-2 text-right">Free agents</th>
                <th className="py-2 text-right">Trades (partial)</th>
              </tr>
            </thead>
            <tbody>
              {owners.map((owner) => (
                <tr
                  key={owner.owner_name}
                  className="border-t border-gray-200 dark:border-gray-800"
                >
                  <td className="py-2 pr-2 font-medium">{owner.owner_name}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{owner.waiver_claims}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{owner.claims_won}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{owner.claims_lost}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">${owner.faab_spent}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{owner.free_agent_pickups}</td>
                  <td className="py-2 text-right tabular-nums">{owner.trades}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2 className="pb-3 text-xl font-bold text-ink dark:text-gray-100">Biggest FAAB bids</h2>
        <ol className="divide-y divide-gray-200 text-sm dark:divide-gray-800">
          {stats.biggestBids.map((bid, i) => (
            <li
              key={`${bid.season_year}-${bid.week_number}-${bid.player_name}-${i}`}
              className="flex justify-between gap-4 py-2"
            >
              <span>
                <span className="pr-2 tabular-nums text-gray-400">{i + 1}.</span>
                {bid.player_name}{' '}
                <span className="text-gray-400">
                  · {bid.owner_name}, {bid.season_year} wk {bid.week_number}
                </span>
              </span>
              <span className="shrink-0 tabular-nums font-semibold">${bid.bid_amount}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
