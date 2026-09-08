import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { allAuthors } from 'contentlayer/generated'
import type { Metadata } from 'next'
import PageTitle from '@/components/PageTitle'
import SectionContainer from '@/components/SectionContainer'
import Comments from '@/components/Comments'
import Link from '@/components/Link'
import Image from '@/components/Image'
import ScrollTopAndComment from '@/components/ScrollTopAndComment'
import MatchupSection from '@/components/articles/MatchupSection'
import { getArticleBySlug, getPublishedArticles } from '@/lib/supabase/articles'
import { getBlurProps } from '@/lib/blurPlaceholders'
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

  const author = allAuthors.find((a) => a.slug === article.author_slug)

  return (
    <SectionContainer>
      <ScrollTopAndComment />
      <article>
        <div className="xl:divide-y xl:divide-gray-200 xl:dark:divide-gray-700">
          <header className="pt-6 xl:pb-6">
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
          <div className="grid-rows-[auto_1fr] divide-y divide-gray-200 pb-8 dark:divide-gray-700 xl:grid xl:grid-cols-4 xl:gap-x-6 xl:divide-y-0">
            {author && (
              <dl className="pb-10 pt-6 xl:border-b xl:border-gray-200 xl:pt-11 xl:dark:border-gray-700">
                <dt className="sr-only">Author</dt>
                <dd>
                  <ul className="flex flex-wrap justify-center gap-4 sm:space-x-12 xl:block xl:space-x-0 xl:space-y-8">
                    <li className="flex items-center space-x-2">
                      {author.avatar && (
                        <Image
                          src={author.avatar}
                          width={38}
                          height={38}
                          alt={author.name}
                          className="h-10 w-10 rounded-full object-cover"
                          {...getBlurProps(author.avatar)}
                        />
                      )}
                      <dl className="whitespace-nowrap text-sm font-medium leading-5">
                        <dt className="sr-only">Name</dt>
                        <dd className="text-ink dark:text-gray-100">{author.name}</dd>
                        <dd>
                          {author.twitter && (
                            <Link
                              href={author.twitter}
                              className={`rounded text-primary-500 hover:text-primary-600 ${focusRingClasses} dark:hover:text-primary-400`}
                            >
                              {author.twitter.replace('https://twitter.com/', '@')}
                            </Link>
                          )}
                        </dd>
                      </dl>
                    </li>
                  </ul>
                </dd>
              </dl>
            )}
            <div
              className={`divide-y divide-gray-200 dark:divide-gray-700 xl:row-span-2 xl:pb-0 ${author ? 'xl:col-span-3' : 'xl:col-span-4'}`}
            >
              <div className="prose max-w-none pb-8 pt-10 dark:prose-invert">
                {article.intro_markdown && (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {article.intro_markdown}
                  </ReactMarkdown>
                )}
                {article.matchups.map((matchup) => (
                  <MatchupSection key={matchup.id} matchup={matchup} />
                ))}
                {article.outro_markdown && (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {article.outro_markdown}
                  </ReactMarkdown>
                )}
              </div>
              {siteMetadata.comments && (
                <div
                  className="pb-6 pt-6 text-center text-gray-700 dark:text-gray-300"
                  id="comment"
                >
                  <Comments slug={article.slug} />
                </div>
              )}
            </div>
            <footer>
              <div className="text-sm font-medium leading-5 xl:col-start-1 xl:row-start-2">
                {(next || prev) && (
                  <div className="flex flex-col gap-3 py-4 xl:py-8">
                    {prev && (
                      <Link
                        href={`/previews-recaps/${prev.slug}`}
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
                        href={`/previews-recaps/${next.slug}`}
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
                  href="/previews-recaps"
                  className={`group inline-flex items-center rounded text-primary-500 hover:text-primary-600 ${focusRingClasses} dark:hover:text-primary-400`}
                  aria-label="Back to Previews & Recaps"
                >
                  <span className="mr-1 inline-block w-2 transition-transform duration-200 ease-out-expo group-hover:-translate-x-1">
                    &larr;
                  </span>
                  Back to Previews & Recaps
                </Link>
              </div>
            </footer>
          </div>
        </div>
      </article>
    </SectionContainer>
  )
}
