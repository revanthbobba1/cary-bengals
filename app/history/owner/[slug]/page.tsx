import Link from 'next/link'
import { notFound } from 'next/navigation'
import { genPageMetadata } from 'app/seo'
import TeamLogo from '@/components/TeamLogo'
import { formatRecord } from '@/components/history/OwnersTable'
import { members } from '@/data/members'
import { loadHistoryBase, summarizeOwners } from '@/lib/history/historyData'

export const metadata = genPageMetadata({ title: 'League History' })
export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: { slug: string } }) {
  const base = await loadHistoryBase()
  if (!base) notFound()
  const owner = summarizeOwners(base).find((o) => o.slug === params.slug)
  if (!owner) notFound()

  const member = members.find((m) => m.slug === owner.slug)
  const seasons = base.teamSeasons
    .filter((row) => row.owner_id === owner.ownerId)
    .sort((a, b) => b.season_year - a.season_year)

  return (
    <div className="container space-y-10 py-12">
      <div className="space-y-2">
        <Link href="/history?tab=owners" className="text-sm text-gray-500 hover:underline">
          ← All-time
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink dark:text-gray-100 sm:text-4xl md:text-5xl">
          {member?.name ?? owner.name}
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          {formatRecord(owner.wins, owner.losses, owner.ties)} regular season ·{' '}
          {(owner.winPct * 100).toFixed(1)}% · {owner.playoffAppearances} playoff appearances in{' '}
          {owner.seasons} seasons
          {member && (
            <>
              {' · '}
              <Link href="/league-members" className="hover:underline">
                League member profile
              </Link>
            </>
          )}
        </p>
      </div>

      <section>
        <h2 className="pb-3 text-xl font-bold text-ink dark:text-gray-100">Trophy case</h2>
        {owner.titles.length === 0 && owner.runnerUps.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">No finals appearances yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {owner.titles.map((year) => (
              <li key={`t${year}`}>🏆 {year} champion</li>
            ))}
            {owner.runnerUps.map((year) => (
              <li key={`r${year}`}>🥈 {year} runner-up</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="pb-3 text-xl font-bold text-ink dark:text-gray-100">Season by season</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 pr-2">Season</th>
                <th className="py-2 pr-2">Team</th>
                <th className="py-2 pr-2">Record</th>
                <th className="py-2 pr-2 text-right">Finish</th>
                <th className="py-2 text-right">Points for</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map((row) => (
                <tr key={row.team_id} className="border-t border-gray-200 dark:border-gray-800">
                  <td className="py-2 pr-2">
                    <Link
                      href={`/history?tab=seasons&season=${row.season_year}`}
                      className="hover:underline"
                    >
                      {row.season_year}
                    </Link>
                  </td>
                  <td className="py-2 pr-2">
                    <span className="inline-flex items-center gap-2">
                      <TeamLogo src={base.teamsById[row.team_id]?.logo ?? null} />
                      {row.team_name}
                    </span>
                  </td>
                  <td className="py-2 pr-2 tabular-nums">
                    {formatRecord(row.wins, row.losses, row.ties)}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">{row.standings_rank}</td>
                  <td className="py-2 text-right tabular-nums">{row.points_for.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
