import Link from '@/components/Link'
import siteMetadata from '@/data/siteMetadata'
import { formatDate } from 'pliny/utils/formatDate'
import NewsletterForm from 'pliny/ui/NewsletterForm'

const MAX_DISPLAY = 5

const arrowLinkClasses =
  'group inline-flex items-center text-base font-medium leading-6 text-primary-500 transition-colors duration-150 ease-out-expo hover:text-primary-600 dark:hover:text-primary-400'

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

export default function Home({ posts }) {
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
        {posts.slice(0, MAX_DISPLAY).map((post) => {
          const { slug, date, title, summary } = post
          return (
            <li
              key={slug}
              className="border-b border-gray-100 last:border-none dark:border-gray-800"
            >
              <Link
                href={`/newsfeed/${slug}`}
                className="group -mx-4 block rounded-card px-4 py-10 transition-colors duration-200 ease-out-expo hover:bg-gray-50 dark:hover:bg-gray-900/60"
              >
                <article>
                  <div className="space-y-2 xl:grid xl:grid-cols-4 xl:items-baseline xl:space-y-0">
                    <dl>
                      <dt className="sr-only">Published on</dt>
                      <dd className="text-base font-medium leading-6 text-gray-500 dark:text-gray-400">
                        <time dateTime={date}>{formatDate(date, siteMetadata.locale)}</time>
                      </dd>
                    </dl>
                    <div className="space-y-5 xl:col-span-3">
                      <div className="space-y-6">
                        <div>
                          <h2 className="text-2xl font-bold leading-8 tracking-tight text-ink transition-colors duration-150 ease-out-expo group-hover:text-primary-500 dark:text-gray-100 dark:group-hover:text-primary-400">
                            {title}
                          </h2>
                        </div>
                        <div className="prose max-w-none text-gray-500 dark:text-gray-400">
                          {summary}
                        </div>
                      </div>
                      <div className="inline-flex items-center text-base font-medium leading-6 text-primary-500 dark:text-primary-400">
                        Read more
                        <span className="ml-1 inline-block w-2 transition-transform duration-200 ease-out-expo group-hover:translate-x-1">
                          &rarr;
                        </span>
                      </div>
                    </div>
                  </div>
                </article>
              </Link>
            </li>
          )
        })}
      </ul>
      {posts.length > MAX_DISPLAY && (
        <div className="flex justify-end pt-6">
          <ArrowLink href="/newsfeed" ariaLabel="All posts">
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
