import { genPageMetadata } from 'app/seo'
import HistoryTabs, { HISTORY_TABS, type HistoryTab } from '@/components/history/HistoryTabs'
import SeasonSelect from '@/components/history/SeasonSelect'
import SeasonView from '@/components/history/SeasonView'
import OwnersTable from '@/components/history/OwnersTable'
import RecordsView from '@/components/history/RecordsView'
import TransactionStatsView from '@/components/history/TransactionStatsView'
import { loadHistoryBase, summarizeOwners } from '@/lib/history/historyData'
import { loadRecords, loadTransactionStats } from '@/lib/history/recordsData'

export const metadata = genPageMetadata({ title: 'League History' })

// Same force-dynamic reasoning as /schedule -- see docs/NETLIFY_DEPLOYMENT.md, "Page Caching and
// Freshness". The Supabase reads are the reason this page must never be cached.
export const dynamic = 'force-dynamic'

function first(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}

export default async function Page({
  searchParams,
}: {
  searchParams: { tab?: string | string[]; season?: string | string[] }
}) {
  const requestedTab = first(searchParams.tab)
  const tab: HistoryTab = HISTORY_TABS.find((t) => t.key === requestedTab)?.key ?? 'seasons'

  const base = await loadHistoryBase()

  return (
    <div className="container py-12">
      <div className="space-y-2 pb-8 md:space-y-5">
        <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-ink dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
          League History
        </h1>
        <p className="text-lg leading-7 text-gray-600 dark:text-gray-400">
          Champions, standings and all-time records. A season appears here once it has finished.
        </p>
      </div>
      <HistoryTabs active={tab} />
      {!base || base.seasons.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-400">No completed seasons to show yet.</p>
      ) : (
        await renderTab(tab, base, Number(first(searchParams.season)))
      )}
    </div>
  )
}

async function renderTab(
  tab: HistoryTab,
  base: NonNullable<Awaited<ReturnType<typeof loadHistoryBase>>>,
  requestedSeason: number
) {
  if (tab === 'owners') return <OwnersTable owners={summarizeOwners(base)} />

  if (tab === 'records') {
    const data = await loadRecords()
    return data ? <RecordsView data={data} /> : <p>Records could not be loaded.</p>
  }

  if (tab === 'transactions') {
    const stats = await loadTransactionStats()
    return stats ? (
      <TransactionStatsView stats={stats} />
    ) : (
      <p>Transaction stats could not be loaded.</p>
    )
  }

  const season = base.seasons.includes(requestedSeason) ? requestedSeason : base.seasons[0]
  return (
    <div className="space-y-6">
      {base.seasons.length > 1 && <SeasonSelect seasons={base.seasons} season={season} />}
      <SeasonView base={base} season={season} />
    </div>
  )
}
