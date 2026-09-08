import { redirect } from 'next/navigation'
import { genPageMetadata } from 'app/seo'
import { createClient } from '@/lib/supabase/server'
import { isCommissioner } from '@/lib/supabase/roles'
import AdminSubNav from '@/components/AdminSubNav'
import ArticleEditor from '@/components/ArticleEditor'

export const metadata = genPageMetadata({ title: 'Edit Article' })

export default async function EditArticlePage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirectTo=/admin/articles/${params.id}/edit`)

  const { data: article, error: articleError } = await supabase
    .from('articles')
    .select('*, article_matchups(*)')
    .eq('id', params.id)
    .order('position', { foreignTable: 'article_matchups' })
    .maybeSingle()

  if (articleError) {
    console.error('Failed to load article:', articleError)
  }

  const showManageLink = isCommissioner(user)
  const isOwner = article?.author_id === user.id
  const canEdit = isOwner || showManageLink

  // Deliberately the same message whether the article doesn't exist or just isn't the viewer's
  // (RLS already prevents the query above from returning someone else's draft at all -- this
  // extra check is for the commissioner case, who *can* see it but this page isn't meant to leak
  // whether an arbitrary id exists to someone it doesn't belong to).
  if (!article || !canEdit) {
    return (
      <div className="py-12 max-w-4xl mx-auto">
        <AdminSubNav active="articles" showManage={showManageLink} />
        <h1 className="text-2xl font-bold tracking-tight text-ink dark:text-gray-100 mb-2">
          Edit Article
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          This article doesn&apos;t exist or isn&apos;t assigned to you.
        </p>
      </div>
    )
  }

  const { article_matchups: matchups, ...articleFields } = article

  return (
    <div className="py-12 max-w-4xl mx-auto">
      <AdminSubNav active="articles" showManage={showManageLink} />
      <ArticleEditor article={articleFields} matchups={matchups} isCommissioner={showManageLink} />
    </div>
  )
}
