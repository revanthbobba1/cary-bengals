import ArticlesList from '@/components/articles/ArticlesList'
import { getPublishedArticles } from '@/lib/supabase/articles'
import { genPageMetadata } from 'app/seo'

export const revalidate = 300

export const metadata = genPageMetadata({ title: 'Articles' })

export default async function ArticlesPage() {
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
        <ArticlesList articles={articles} />
      )}
    </div>
  )
}
