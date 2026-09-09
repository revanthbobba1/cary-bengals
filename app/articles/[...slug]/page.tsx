import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { allAuthors } from 'contentlayer/generated'
import type { Metadata } from 'next'
import PageTitle from '@/components/PageTitle'
import SectionContainer from '@/components/SectionContainer'
import Comments from '@/components/Comments'
import Link from '@/components/Link'
import ScrollTopAndComment from '@/components/ScrollTopAndComment'
import MatchupSection from '@/components/articles/MatchupSection'
import ScoreboardStrip from '@/components/articles/ScoreboardStrip'
import ArticleSidebar from '@/components/articles/ArticleSidebar'
import { getArticleBySlug, getPublishedArticles } from '@/lib/supabase/articles'
import { createPublicClient } from '@/lib/supabase/public'
import { focusRingClasses } from '@/lib/focusRing'
import siteMetadata from '@/data/siteMetadata'

export const revalidate = 300

const postDateTemplate: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
}

export async function generateStaticParams() {
  try {
    const articles = await getPublishedArticles()
    return articles.map((a) => ({ slug: a.slug.split('/') }))
  } catch (error) {
    // A transient Supabase outage during `next build` shouldn't fail the whole build --
    // articles just render on-demand at request time instead (dynamicParams defaults to true).
    console.error('Failed to load published articles for generateStaticParams:', error)
    return []
  }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string[] }
}): Promise<Metadata | undefined> {
  const slug = decodeURI(params.slug.join('/'))
  let article: Awaited<ReturnType<typeof getArticleBySlug>>
  try {
    article = await getArticleBySlug(slug)
  } catch (error) {
    console.error(`Failed to load article "${slug}" for generateMetadata:`, error)
    return
  }
  if (!article) return

  const author = allAuthors.find((a) => a.slug === article.author_slug)
  const publishedAt = article.published_at
    ? new Date(article.published_at).toISOString()
    : undefined
  const image = { url: siteMetadata.socialBanner }

  return {
    title: article.title,
    description: article.summary ?? undefined,
    openGraph: {
      title: article.title,
      description: article.summary ?? undefined,
      siteName: siteMetadata.title,
      locale: 'en_US',
      type: 'article',
      publishedTime: publishedAt,
      url: './',
      images: [image],
      authors: author ? [author.name] : [siteMetadata.author],
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description: article.summary ?? undefined,
      images: [image.url],
    },
  }
}

export default async function ArticlePage({ params }: { params: { slug: string[] } }) {
  const slug = decodeURI(params.slug.join('/'))

  let article: Awaited<ReturnType<typeof getArticleBySlug>>
  try {
    article = await getArticleBySlug(slug)
  } catch (error) {
    console.error(`Failed to load article "${slug}":`, error)
    return (
      <div className="mt-24 text-center">
        <PageTitle>Couldn&apos;t load this article</PageTitle>
        <p className="mt-4 text-gray-500 dark:text-gray-400">
          Something went wrong loading this page — try refreshing.
        </p>
      </div>
    )
  }

  if (!article) {
    return (
      <div className="mt-24 text-center">
        <PageTitle>
          Under Construction{' '}
          <span role="img" aria-label="roadwork sign">
            🚧
          </span>
        </PageTitle>
      </div>
    )
  }

  let allArticles: Awaited<ReturnType<typeof getPublishedArticles>> = []
  try {
    allArticles = await getPublishedArticles()
  } catch (error) {
    console.error('Failed to load published articles for prev/next navigation:', error)
  }
  const articleIndex = allArticles.findIndex((a) => a.slug === slug)
  const prev = articleIndex >= 0 ? allArticles[articleIndex + 1] : undefined
  const next = articleIndex > 0 ? allArticles[articleIndex - 1] : undefined

  const contentlayerAuthor = allAuthors.find((a) => a.slug === article.author_slug)
  const author = contentlayerAuthor
    ? {
        name: contentlayerAuthor.name,
        avatar: contentlayerAuthor.avatar,
        twitter: contentlayerAuthor.twitter,
      }
    : null

  let pollTopFive: { team_id: string; team_name: string; final_rank: number }[] | null = null
  try {
    const supabase = createPublicClient()
    const { data: pollWeek } = await supabase
      .from('poll_weeks')
      .select('id')
      .eq('season_year', article.season_year)
      .eq('week_number', article.week_number)
      .eq('is_locked', true)
      .maybeSingle()

    if (pollWeek) {
      const { data: results } = await supabase
        .from('poll_results')
        .select('team_id, final_rank, team:teams(name)')
        .eq('poll_week_id', pollWeek.id)
        .order('final_rank')
        .limit(5)

      if (results && results.length > 0) {
        pollTopFive = results.map((r) => ({
          team_id: r.team_id,
          team_name: (r.team as unknown as { name: string } | null)?.name ?? 'Unknown Team',
          final_rank: r.final_rank,
        }))
      }
    }
  } catch (error) {
    console.error(
      `Failed to load poll cross-link for ${article.season_year} week ${article.week_number}:`,
      error
    )
  }

  return (
    <SectionContainer>
      <ScrollTopAndComment />
      <article>
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

        <ScoreboardStrip matchups={article.matchups} kind={article.kind} />

        <div className="grid grid-cols-1 gap-x-10 pb-8 xl:grid-cols-[1fr_280px]">
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
            {siteMetadata.comments && (
              <div className="pb-6 pt-6 text-center text-gray-700 dark:text-gray-300" id="comment">
                <Comments slug={article.slug} />
              </div>
            )}
          </div>

          <ArticleSidebar matchups={article.matchups} author={author} pollTopFive={pollTopFive} />
        </div>

        <footer className="border-t border-gray-200 dark:border-gray-700">
          <div className="text-sm font-medium leading-5">
            {(next || prev) && (
              <div className="flex flex-col gap-3 py-4 xl:py-8">
                {prev && (
                  <Link
                    href={`/articles/${prev.slug}`}
                    className={`group block rounded-control border border-gray-200 bg-white p-4 shadow-card transition-all duration-150 ease-out-expo hover:-translate-y-0.5 hover:shadow-raised ${focusRingClasses} active:scale-[0.99] dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark dark:hover:shadow-raised-dark`}
                  >
                    <h2 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      &larr; Previous Article
                    </h2>
                    <div className="mt-1 font-semibold text-ink transition-colors duration-150 ease-out-expo group-hover:text-primary-500 dark:text-gray-100 dark:group-hover:text-primary-400">
                      {prev.title}
                    </div>
                  </Link>
                )}
                {next && (
                  <Link
                    href={`/articles/${next.slug}`}
                    className={`group block rounded-control border border-gray-200 bg-white p-4 shadow-card transition-all duration-150 ease-out-expo hover:-translate-y-0.5 hover:shadow-raised ${focusRingClasses} active:scale-[0.99] dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark dark:hover:shadow-raised-dark`}
                  >
                    <h2 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Next Article &rarr;
                    </h2>
                    <div className="mt-1 font-semibold text-ink transition-colors duration-150 ease-out-expo group-hover:text-primary-500 dark:text-gray-100 dark:group-hover:text-primary-400">
                      {next.title}
                    </div>
                  </Link>
                )}
              </div>
            )}
          </div>
          <div className="pt-4 xl:pt-8">
            <Link
              href="/articles"
              className={`group inline-flex items-center rounded text-primary-500 hover:text-primary-600 ${focusRingClasses} dark:hover:text-primary-400`}
              aria-label="Back to Articles"
            >
              <span className="mr-1 inline-block w-2 transition-transform duration-200 ease-out-expo group-hover:-translate-x-1">
                &larr;
              </span>
              Back to Articles
            </Link>
          </div>
        </footer>
      </article>
    </SectionContainer>
  )
}
