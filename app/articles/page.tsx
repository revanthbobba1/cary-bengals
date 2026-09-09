import ArticlesList from '@/components/articles/ArticlesList'
import { getPublishedArticles } from '@/lib/supabase/articles'
import { genPageMetadata } from 'app/seo'

// Kept, but it no longer caches this page's HTML: reading `searchParams` below makes the route
// dynamic, so it renders per request. It still bounds any caching of the data fetch underneath,
// which is why it isn't simply deleted. A published article now appears immediately, so the
// `revalidatePath('/articles')` in the admin publish action is belt-and-braces rather than load-bearing.
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
  searchParams: { season?: string }
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
        <ArticlesList articles={articles} season={Number(searchParams.season)} />
      )}
    </div>
  )
}
