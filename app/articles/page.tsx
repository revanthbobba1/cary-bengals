import ArticlesList from '@/components/articles/ArticlesList'
import { getPublishedArticles } from '@/lib/supabase/articles'
import { genPageMetadata } from 'app/seo'

// Rendered on every request, with Next's Data Cache disabled for the Supabase reads (that is what
// `force-dynamic` does to every fetch). Reading `searchParams` below already made the route
// dynamic, but `revalidate = 300` still cached the Supabase GET, and the `revalidatePath()` in the
// publish action that was meant to clear it does not purge Netlify's cache, so a published article
// could stay missing. See docs/NETLIFY_DEPLOYMENT.md, "Page Caching and Freshness".
export const dynamic = 'force-dynamic'

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
      <div className="space-y-2 pb-10 pt-14 md:space-y-5 md:pb-12 md:pt-16">
        <h1 className="text-4xl font-extrabold leading-10 tracking-tight text-ink dark:text-gray-100 sm:text-5xl sm:leading-tight md:text-6xl md:leading-14">
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
