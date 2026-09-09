import { redirect } from 'next/navigation'
import { allAuthors } from 'contentlayer/generated'
import { genPageMetadata } from 'app/seo'
import { createClient } from '@/lib/supabase/server'
import { isCommissioner } from '@/lib/supabase/roles'
import { getPollTopFive } from '@/lib/supabase/polls'
import SectionContainer from '@/components/SectionContainer'
import PageTitle from '@/components/PageTitle'
import Link from '@/components/Link'
import ArticleView from '@/components/articles/ArticleView'
import { focusRingClasses } from '@/lib/focusRing'
import type { ArticleWithMatchups } from '@/lib/types/article'

export const metadata = genPageMetadata({ title: 'Preview Article' })

export default async function PreviewArticlePage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirectTo=/admin/articles/${params.id}/preview`)

  // Same ownership rule as the editor itself (RLS already prevents this query from returning
  // someone else's draft at all -- this manual check covers the commissioner case, who *can* see
  // it but shouldn't get a different error message than "doesn't exist" for one that isn't theirs).
  const { data: article, error: articleError } = await supabase
    .from('articles')
    .select('*, article_matchups(*)')
    .eq('id', params.id)
    .order('position', { foreignTable: 'article_matchups' })
    .maybeSingle()

  if (articleError) {
    console.error('Failed to load article for preview:', articleError)
  }

  const showManageLink = isCommissioner(user)
  const isOwner = article?.author_id === user.id
  const canView = isOwner || showManageLink

  if (!article || !canView) {
    return (
      <div className="py-12 max-w-4xl mx-auto">
        <PageTitle>Preview</PageTitle>
        <p className="mt-4 text-gray-600 dark:text-gray-400">
          This article doesn&apos;t exist or isn&apos;t assigned to you.
        </p>
      </div>
    )
  }

  const { article_matchups: matchups, ...articleFields } = article
  const articleWithMatchups = { ...articleFields, matchups } as ArticleWithMatchups

  const pollTopFive = await getPollTopFive(
    articleWithMatchups.season_year,
    articleWithMatchups.week_number
  ).catch((error) => {
    console.error('Failed to load poll cross-link for preview:', error)
    return []
  })

  const contentlayerAuthor = allAuthors.find((a) => a.slug === articleWithMatchups.author_slug)
  const author = contentlayerAuthor
    ? {
        name: contentlayerAuthor.name,
        avatar: contentlayerAuthor.avatar,
        twitter: contentlayerAuthor.twitter,
      }
    : null

  return (
    <SectionContainer>
      <article>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-control border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-400">
          <span>
            Preview &mdash;{' '}
            {articleWithMatchups.status === 'published' ? 'published' : 'not published yet'}. This
            is how the article will look on the site.
          </span>
          <Link
            href={`/admin/articles/${articleWithMatchups.id}/edit`}
            className={`shrink-0 rounded font-semibold underline ${focusRingClasses}`}
          >
            Back to editor
          </Link>
        </div>

        <ArticleView
          article={articleWithMatchups}
          author={author}
          pollTopFive={pollTopFive}
          showComments={false}
        />
      </article>
    </SectionContainer>
  )
}
