import PressConferencesList from '@/components/PressConferencesList'
import { getPressConferences } from '@/lib/supabase/pressConferences'
import { genPageMetadata } from 'app/seo'

// Rendered on every request -- same reasoning as app/articles/page.tsx: an admin write here has
// no cache-purge path (revalidatePath() doesn't reliably clear Netlify's cache, see
// docs/NETLIFY_DEPLOYMENT.md), so a newly-added press conference could otherwise stay missing.
export const dynamic = 'force-dynamic'

export const metadata = genPageMetadata({ title: 'Press Conferences' })

// Reading `searchParams` opts this route into dynamic rendering and keeps the season filter
// resolvable on the server, same reasoning as app/articles/page.tsx's identical signature.
export default async function Conferences({
  searchParams,
}: {
  searchParams: { season?: string | string[] }
}) {
  let conferences: Awaited<ReturnType<typeof getPressConferences>> = []
  let loadError = false
  try {
    conferences = await getPressConferences()
  } catch (error) {
    console.error('Failed to load press conferences:', error)
    loadError = true
  }

  return (
    <>
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        <div className="space-y-2 pb-8 pt-6 md:space-y-5">
          <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
            Cary Bengals Press Conferences
          </h1>
        </div>
        <div className="container py-12">
          {loadError ? (
            <p className="text-gray-500 dark:text-gray-400">
              Couldn&apos;t load press conferences right now — try refreshing the page.
            </p>
          ) : (
            <PressConferencesList
              conferences={conferences}
              season={typeof searchParams.season === 'string' ? Number(searchParams.season) : NaN}
            />
          )}
        </div>
      </div>
    </>
  )
}
