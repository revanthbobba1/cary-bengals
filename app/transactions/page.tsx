import { genPageMetadata } from 'app/seo'
import siteMetadata from '@/data/siteMetadata'
import { loadTransactionData } from '@/lib/espn/transactionData'
import TransactionsBrowser from '@/components/TransactionsBrowser'

export const metadata = genPageMetadata({ title: 'Transactions' })

// Same force-dynamic reasoning as /schedule -- see docs/NETLIFY_DEPLOYMENT.md, "Page Caching and
// Freshness". The Supabase reads are the reason this page must never be cached.
export const dynamic = 'force-dynamic'

export default async function Page({
  searchParams,
}: {
  // A repeated param arrives as an array, so the type can't be just `string`.
  searchParams: { season?: string | string[]; week?: string | string[] }
}) {
  const data = await loadTransactionData()

  // An explicit empty value (`?week=`) must not silently become 0 -- `Number('')` is `0`.
  const rawSeason = typeof searchParams.season === 'string' ? searchParams.season : ''
  const parsedSeason = rawSeason !== '' ? Number(rawSeason) : Number.NaN
  const rawWeek = typeof searchParams.week === 'string' ? searchParams.week : ''
  const parsedWeek = rawWeek !== '' ? Number(rawWeek) : Number.NaN

  return (
    <div className="container py-12">
      <div className="space-y-2 pb-8 md:space-y-5">
        <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-ink dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
          Transactions
        </h1>
        <p className="text-lg leading-7 text-gray-600 dark:text-gray-400">
          Waiver claims, free-agent pickups and trades
        </p>
      </div>
      <TransactionsBrowser
        transactions={data.transactions}
        teamNameByKey={data.teamNameByKey}
        teamLogoByKey={data.teamLogoByKey}
        currentSeason={siteMetadata.currentSeason}
        initialSeason={Number.isFinite(parsedSeason) ? parsedSeason : null}
        initialWeek={rawWeek === 'all' ? 'all' : Number.isFinite(parsedWeek) ? parsedWeek : null}
      />
    </div>
  )
}
