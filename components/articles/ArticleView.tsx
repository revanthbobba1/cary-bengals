import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import PageTitle from '@/components/PageTitle'
import Comments from '@/components/Comments'
import Link from '@/components/Link'
import MatchupSection from '@/components/articles/MatchupSection'
import ScoreboardStrip from '@/components/articles/ScoreboardStrip'
import ArticleSidebar from '@/components/articles/ArticleSidebar'
import type { ArticleKind, ArticleWithMatchups } from '@/lib/types/article'
import type { PollTopFiveRow } from '@/lib/supabase/polls'
import siteMetadata from '@/data/siteMetadata'

const postDateTemplate: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
}

interface AuthorInfo {
  name: string
  avatar?: string
  twitter?: string
}

interface SiblingArticle {
  slug: string
  title: string
  kind: ArticleKind
}

interface Props {
  article: ArticleWithMatchups
  author: AuthorInfo | null
  pollTopFive: PollTopFiveRow[]
  siblingArticle?: SiblingArticle | null
  /** Off for an unpublished draft preview -- there's no real Giscus thread for it yet. */
  showComments?: boolean
}

/**
 * The article's header-through-sidebar content, shared between the public article page and the
 * admin "preview as rendered" page -- both need the exact same rendering, just wrapped in a
 * different outer chrome (published-only footer/prev-next vs. a draft banner).
 */
export default function ArticleView({
  article,
  author,
  pollTopFive,
  siblingArticle = null,
  showComments = true,
}: Props) {
  const sidebarHasContent = Boolean(author) || article.matchups.length > 0 || pollTopFive.length > 0

  return (
    <>
      <header className="pt-6">
        <div className="space-y-1 text-center">
          {article.published_at && (
            <dl className="space-y-10">
              <div>
                <dt className="sr-only">Published on</dt>
                <dd className="text-base font-medium leading-6 text-gray-500 dark:text-gray-400">
                  <time dateTime={article.published_at}>
                    {new Date(article.published_at).toLocaleDateString(
                      siteMetadata.locale,
                      postDateTemplate
                    )}
                  </time>
                </dd>
              </div>
            </dl>
          )}
          <div>
            <PageTitle>{article.title}</PageTitle>
          </div>
        </div>
      </header>

      {siblingArticle && (
        <div className="mt-6 flex justify-center">
          <Link
            href={`/articles/${siblingArticle.slug}`}
            className="group inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-600 shadow-card transition-all duration-150 ease-out-expo hover:-translate-y-0.5 hover:border-primary-300 hover:text-primary-500 hover:shadow-raised dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:shadow-card-dark dark:hover:text-primary-400 dark:hover:shadow-raised-dark"
          >
            {article.kind === 'preview' ? 'See how it turned out' : 'Read the preview'}
            <span className="text-primary-500 dark:text-primary-400">
              {siblingArticle.title} &rarr;
            </span>
          </Link>
        </div>
      )}

      <ScoreboardStrip matchups={article.matchups} kind={article.kind} />

      <div
        className={`grid grid-cols-1 gap-x-10 pb-8 ${sidebarHasContent ? 'xl:grid-cols-[1fr_280px]' : ''}`}
      >
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          <div className="prose max-w-none pb-8 pt-10 dark:prose-invert">
            {article.intro_markdown && (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.intro_markdown}</ReactMarkdown>
            )}
            {article.matchups.map((matchup) => (
              <MatchupSection key={matchup.id} matchup={matchup} articleKind={article.kind} />
            ))}
            {article.outro_markdown && (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.outro_markdown}</ReactMarkdown>
            )}
          </div>
          {showComments && siteMetadata.comments && (
            <div className="pb-6 pt-6 text-center text-gray-700 dark:text-gray-300" id="comment">
              <Comments slug={article.slug} />
            </div>
          )}
        </div>

        {sidebarHasContent && (
          <ArticleSidebar matchups={article.matchups} author={author} pollTopFive={pollTopFive} />
        )}
      </div>
    </>
  )
}
