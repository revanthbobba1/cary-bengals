import { formatDate } from 'pliny/utils/formatDate'
import Link from '@/components/Link'
import siteMetadata from '@/data/siteMetadata'
import { focusRingClasses } from '@/lib/focusRing'
import type { PublishedArticleSummary } from '@/lib/supabase/articles'

interface ArticleCardProps {
  article: PublishedArticleSummary
  /** Home feed shows an inline "Read more" arrow; the full list page doesn't need it. */
  showReadMore?: boolean
}

export default function ArticleCard({ article, showReadMore = false }: ArticleCardProps) {
  const { slug, title, summary, published_at } = article

  return (
    <Link
      href={`/articles/${slug}`}
      className={`group -mx-4 block rounded-card px-4 py-10 transition-all duration-200 ease-out-expo hover:bg-gray-50 ${focusRingClasses} active:scale-[0.99] dark:hover:bg-gray-900/60`}
    >
      <article className="space-y-2 xl:grid xl:grid-cols-4 xl:items-baseline xl:space-y-0">
        <dl>
          <dt className="sr-only">Published on</dt>
          <dd className="text-base font-medium leading-6 text-gray-500 dark:text-gray-400">
            {published_at && (
              <time dateTime={published_at}>{formatDate(published_at, siteMetadata.locale)}</time>
            )}
          </dd>
        </dl>
        <div className="space-y-3 xl:col-span-3">
          <h3 className="text-2xl font-bold leading-8 tracking-tight text-ink transition-colors duration-150 ease-out-expo group-hover:text-primary-500 dark:text-gray-100 dark:group-hover:text-primary-400">
            {title}
          </h3>
          {summary && (
            <div className="prose max-w-none text-gray-500 dark:text-gray-400">{summary}</div>
          )}
          {showReadMore && (
            <div className="inline-flex items-center text-base font-medium leading-6 text-primary-500 dark:text-primary-400">
              Read more
              <span className="ml-1 inline-block w-2 transition-transform duration-200 ease-out-expo group-hover:translate-x-1">
                &rarr;
              </span>
            </div>
          )}
        </div>
      </article>
    </Link>
  )
}
