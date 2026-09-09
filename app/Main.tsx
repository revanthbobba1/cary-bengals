import Link from '@/components/Link'
import siteMetadata from '@/data/siteMetadata'
import NewsletterForm from 'pliny/ui/NewsletterForm'
import { focusRingClasses } from '@/lib/focusRing'
import ArticleCard from '@/components/articles/ArticleCard'
import type { PublishedArticleSummary } from '@/lib/supabase/articles'

const MAX_DISPLAY = 5

const arrowLinkClasses = `group inline-flex items-center rounded text-base font-medium leading-6 text-primary-500 transition-colors duration-150 ease-out-expo hover:text-primary-600 ${focusRingClasses} dark:hover:text-primary-400`

function ArrowLink({
  href,
  children,
  ariaLabel,
}: {
  href: string
  children: string
  ariaLabel: string
}) {
  return (
    <Link href={href} className={arrowLinkClasses} aria-label={ariaLabel}>
      {children}
      <span className="ml-1 inline-block w-2 transition-transform duration-200 ease-out-expo group-hover:translate-x-1">
        &rarr;
      </span>
    </Link>
  )
}

export default function Home({ posts }: { posts: PublishedArticleSummary[] }) {
  return (
    <>
      <div className="space-y-2 pb-8 pt-6 md:space-y-5">
        <h3 className="text-3xl font-extrabold leading-9 tracking-tight text-ink dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
          Latest from the Cary Bengals
        </h3>
        <p className="text-lg leading-7 text-gray-500 dark:text-gray-400">
          {siteMetadata.description}
        </p>
      </div>
      <ul className="border-t border-gray-100 dark:border-gray-800">
        {!posts.length && 'No posts found.'}
        {posts.slice(0, MAX_DISPLAY).map((post) => (
          <li
            key={post.id}
            className="border-b border-gray-100 last:border-none dark:border-gray-800"
          >
            <ArticleCard article={post} showReadMore />
          </li>
        ))}
      </ul>
      {posts.length > MAX_DISPLAY && (
        <div className="flex justify-end pt-6">
          <ArrowLink href="/articles" ariaLabel="All posts">
            All Posts
          </ArrowLink>
        </div>
      )}
      {siteMetadata.newsletter?.provider && (
        <div className="flex items-center justify-center pt-4">
          <NewsletterForm />
        </div>
      )}
    </>
  )
}
