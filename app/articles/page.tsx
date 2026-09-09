import ArticlesList from '@/components/articles/ArticlesList'
import { getPublishedArticles } from '@/lib/supabase/articles'
import { genPageMetadata } from 'app/seo'

// This no longer caches the page's HTML -- reading `searchParams` below makes the route dynamic,
// so it re-renders per request -- but it very much still caches the data. `postgrest-js` calls
// global `fetch` with only method/headers/body/signal, so under Next's patched fetch the Supabase
// GET lands in the Data Cache with this value as its TTL. A dynamic render can therefore still
// serve a response up to 300s stale, which means `revalidatePath('/articles')` in the admin
// publish action stays load-bearing: without it a freshly published article can be missing for up
// to five minutes. Don't delete either this or that call on the assumption the other covers it.
export const revalidate = 300

export const metadata = genPageMetadata({ title: 'Articles' })

// Reading `searchParams` opts this route into dynamic rendering, which is the point: the season
// filter lives in the URL, and resolving it on the server keeps the article list in the
// server-rendered HTML. Doing the same thing with `useSearchParams()` in the client component
// instead bails the whole list out of SSR (`NEXT_DYNAMIC_NO_SSR_CODE`), which for the site's main
// content page is a worse trade than giving up the ISR cache.
export default async function ArticlesPage({
  searchParams,
}: {
  // A repeated param (`?season=2024&season=2023`) arrives as an array, so the type can't be just
  // `string`. There's no sensible winner between the two, so anything that isn't a single value
  // falls through to the newest season, same as an unknown or non-numeric one.
  searchParams: { season?: string | string[] }
}) {
  let articles: Awaited<ReturnType<typeof getPublishedArticles>> = []
  let loadError = false
  try {
    articles = await getPublishedArticles()
  } catch (error) {
    console.error('Failed to load published articles:', error)
    loadError = true
  }

  return (
    <div>
      <div className="space-y-2 pb-8 pt-6 md:space-y-5">
        <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-ink dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
          Articles
        </h1>
      </div>
      {loadError ? (
        <p className="text-gray-500 dark:text-gray-400">
          Couldn&apos;t load articles right now — try refreshing the page.
        </p>
      ) : (
        <ArticlesList
          articles={articles}
          season={typeof searchParams.season === 'string' ? Number(searchParams.season) : NaN}
        />
      )}
    </div>
  )
}
