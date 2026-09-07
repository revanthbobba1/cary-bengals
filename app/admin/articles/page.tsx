import { redirect } from 'next/navigation'
import { genPageMetadata } from 'app/seo'
import { createClient } from '@/lib/supabase/server'
import { isCommissioner } from '@/lib/supabase/roles'
import AdminSubNav from '@/components/AdminSubNav'
import AssignArticleForm from '@/components/AssignArticleForm'
import ArticlesList from '@/components/ArticlesList'

export const metadata = genPageMetadata({ title: 'Articles' })

export default async function AdminArticlesPage() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirectTo=/admin/articles')

  const showManageLink = isCommissioner(user)

  // Explicitly filtered to the viewer's own rows for a plain member, even though RLS would
  // already let their own drafts through: RLS's "Public can view published articles" policy is
  // TO anon, authenticated with no author check, so an unfiltered query would also return every
  // *other* published article in the league -- fine for the commissioner's "All Articles" duty
  // roster, but not what "Your Articles" is supposed to mean for a plain member.
  let query = supabase
    .from('articles')
    .select('*')
    .order('season_year', { ascending: false })
    .order('week_number', { ascending: false })
  if (!showManageLink) {
    query = query.eq('author_id', user.id)
  }
  const { data: articles } = await query

  let members: { id: string; email: string; full_name: string | null }[] = []
  if (showManageLink) {
    const { data, error } = await supabase.rpc('list_league_members')
    if (error) {
      console.error('Failed to load league members:', error)
    } else {
      members = data ?? []
    }
  }

  return (
    <div className="py-12 max-w-4xl mx-auto">
      <AdminSubNav active="articles" showManage={showManageLink} />
      <h1 className="text-2xl font-bold tracking-tight text-ink dark:text-gray-100 mb-6">
        Articles
      </h1>
      <div className="space-y-8">
        {showManageLink && (
          <AssignArticleForm members={members} defaultSeasonYear={new Date().getFullYear()} />
        )}
        <ArticlesList articles={articles || []} members={showManageLink ? members : undefined} />
      </div>
    </div>
  )
}
