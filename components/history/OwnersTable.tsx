import Link from 'next/link'
import type { OwnerSummary } from '@/lib/history/historyData'

export function formatRecord(wins: number, losses: number, ties: number): string {
  return `${wins}-${losses}${ties > 0 ? `-${ties}` : ''}`
}

export default function OwnersTable({ owners }: { owners: OwnerSummary[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Grouped by owner, not team name (teams are renamed every year). Record and points are
        regular season; titles and playoff appearances come from the playoff brackets.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase text-gray-500">
            <tr>
              <th className="py-2 pr-2">Owner</th>
              <th className="py-2 pr-2">Record</th>
              <th className="py-2 pr-2 text-right">Win %</th>
              <th className="py-2 pr-2 text-right">Titles</th>
              <th className="py-2 pr-2 text-right">Playoffs</th>
              <th className="py-2 pr-2 text-right">Best / worst</th>
              <th className="py-2 text-right">Points for</th>
            </tr>
          </thead>
          <tbody>
            {owners.map((owner) => (
              <tr key={owner.ownerId} className="border-t border-gray-200 dark:border-gray-800">
                <td className="py-2 pr-2 font-medium">
                  <Link href={`/history/owner/${owner.slug}`} className="hover:underline">
                    {owner.name}
                  </Link>
                </td>
                <td className="py-2 pr-2 tabular-nums">
                  {formatRecord(owner.wins, owner.losses, owner.ties)}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {(owner.winPct * 100).toFixed(1)}%
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">{owner.titles.length}</td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {owner.playoffAppearances}/{owner.seasons}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {owner.bestRank} / {owner.worstRank}
                </td>
                <td className="py-2 text-right tabular-nums">{owner.pointsFor.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
