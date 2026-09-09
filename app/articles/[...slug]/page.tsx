import { allAuthors } from 'contentlayer/generated'
import type { Metadata } from 'next'
import PageTitle from '@/components/PageTitle'
import SectionContainer from '@/components/SectionContainer'
import Link from '@/components/Link'
import ScrollTopAndComment from '@/components/ScrollTopAndComment'
import ArticleView from '@/components/articles/ArticleView'
import { getArticleBySlug, getPublishedArticles, getSiblingArticle } from '@/lib/supabase/articles'
import { getPollTopFive } from '@/lib/supabase/polls'
import { focusRingClasses } from '@/lib/focusRing'
import siteMetadata from '@/data/siteMetadata'

export const revalidate = 300

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

  // None of these depend on each other, so fetch them together instead of round trips in
  // sequence -- all only need `article`, which is already resolved at this point.
  const [allArticles, pollTopFive, siblingArticle] = await Promise.all([
    getPublishedArticles().catch((error) => {
      console.error('Failed to load published articles for prev/next navigation:', error)
      return [] as Awaited<ReturnType<typeof getPublishedArticles>>
    }),
    getPollTopFive(article.season_year, article.week_number).catch((error) => {
      console.error(
        `Failed to load poll cross-link for ${article.season_year} week ${article.week_number}:`,
        error
      )
      return []
    }),
    getSiblingArticle(article.season_year, article.week_number, article.kind).catch((error) => {
      console.error(
        `Failed to load sibling article for ${article.season_year} week ${article.week_number}:`,
        error
      )
      return null
    }),
  ])

  // Prev/next stays within the same season -- crossing a year boundary mid-navigation reads as a
  // bug, not a feature (see docs/PREVIEWS_RECAPS_PLAN.md §4.2).
  const sameSeasonArticles = allArticles.filter((a) => a.season_year === article.season_year)
  const articleIndex = sameSeasonArticles.findIndex((a) => a.slug === slug)
  const prev = articleIndex >= 0 ? sameSeasonArticles[articleIndex + 1] : undefined
  const next = articleIndex > 0 ? sameSeasonArticles[articleIndex - 1] : undefined

  const contentlayerAuthor = allAuthors.find((a) => a.slug === article.author_slug)
  const author = contentlayerAuthor
    ? {
        name: contentlayerAuthor.name,
        avatar: contentlayerAuthor.avatar,
        twitter: contentlayerAuthor.twitter,
      }
    : null

  return (
    <SectionContainer>
      <ScrollTopAndComment />
      <article>
        <ArticleView
          article={article}
          author={author}
          pollTopFive={pollTopFive}
          siblingArticle={siblingArticle}
        />

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
