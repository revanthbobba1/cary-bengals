import Link from '@/components/Link'
import siteMetadata from '@/data/siteMetadata'
import { focusRingClasses } from '@/lib/focusRing'
import type { PublishedArticleSummary } from '@/lib/supabase/articles'

const badgeClasses: Record<PublishedArticleSummary['kind'], string> = {
  preview: 'bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300',
  recap: 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300',
}

export default function ArticleGridCard({ article }: { article: PublishedArticleSummary }) {
  return (
    <Link
      href={`/articles/${article.slug}`}
      className={`group block flex-1 basis-80 rounded-card border border-gray-200 bg-white p-5 shadow-card transition-all duration-200 ease-out-expo hover:-translate-y-0.5 hover:shadow-raised ${focusRingClasses} active:scale-[0.99] dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark dark:hover:shadow-raised-dark`}
    >
      <span
        className={`mb-3 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${badgeClasses[article.kind]}`}
      >
        {article.kind}
      </span>
      <h3 className="mb-2 text-base font-bold leading-tight text-ink transition-colors duration-150 ease-out-expo group-hover:text-primary-500 dark:text-gray-100 dark:group-hover:text-primary-400">
        {article.title}
      </h3>
      {article.summary && (
        <p className="mb-4 line-clamp-3 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          {article.summary}
        </p>
      )}
      <p className="text-xs font-medium text-gray-400 dark:text-gray-500">
        {article.published_at &&
          new Date(article.published_at).toLocaleDateString(siteMetadata.locale, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
      </p>
    </Link>
  )
}
