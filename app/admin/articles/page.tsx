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

  // "Your Articles" and the commissioner-only duty roster/member list are all independent of
  // each other, so they're fetched together rather than one sequential round trip apiece.
  const [myArticlesRes, allArticlesRes, membersRes] = await Promise.all([
    // Member-facing: always just the viewer's own rows, regardless of role -- a commissioner is
    // also a league member and may have their own drafts assigned, same as the dashboard's Poll
    // section shows every member (commissioner included) their own submission status.
    supabase
      .from('articles')
      .select('*')
      .eq('author_id', user.id)
      .order('season_year', { ascending: false })
      .order('week_number', { ascending: false }),
    // Commissioner-only: the full duty roster. Fetched separately (not by dropping the
    // author_id filter above) so "Your Articles" never balloons into "every published article
    // in the league" -- RLS's "Public can view published articles" policy is TO anon,
    // authenticated with no author check, so an unfiltered query would return far more than
    // what this section means to show a plain member.
    showManageLink
      ? supabase
          .from('articles')
          .select('*')
          .order('season_year', { ascending: false })
          .order('week_number', { ascending: false })
      : null,
    showManageLink ? supabase.rpc('list_league_members') : null,
  ])

  if (myArticlesRes.error) {
    console.error('Failed to load your articles:', myArticlesRes.error)
  }
  const myArticles = myArticlesRes.data

  let allArticles: typeof myArticles = []
  if (allArticlesRes) {
    if (allArticlesRes.error) {
      console.error('Failed to load all articles:', allArticlesRes.error)
    } else {
      allArticles = allArticlesRes.data ?? []
    }
  }

  let members: { id: string; email: string; full_name: string | null }[] = []
  if (membersRes) {
    if (membersRes.error) {
      console.error('Failed to load league members:', membersRes.error)
    } else {
      members = membersRes.data ?? []
    }
  }

  return (
    <div className="py-12 max-w-4xl mx-auto">
      <AdminSubNav active="articles" showManage={showManageLink} />
      <h1 className="text-2xl font-bold tracking-tight text-ink dark:text-gray-100 mb-6">
        Articles
      </h1>

      {/* Same "section per audience" split as the /admin dashboard: member-facing content (your
          own articles) and commissioner-only content (assignment + the full duty roster) get
          entirely separate sections, not just separate cards, so it's unambiguous which parts of
          this page are "things every member checks" vs. "things only the commissioner checks". */}
      <div className="space-y-12 py-8">
        <section aria-labelledby="articles-section-heading">
          <h2
            id="articles-section-heading"
            className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Your Articles
          </h2>
          <ArticlesList articles={myArticles || []} />
        </section>

        {showManageLink && (
          <section aria-labelledby="commissioner-section-heading">
            <h2
              id="commissioner-section-heading"
              className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
            >
              Commissioner
              <span className="rounded-full bg-gray-200 dark:bg-gray-700 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-gray-600 dark:text-gray-300">
                Only visible to you
              </span>
            </h2>
            <div className="space-y-8">
              <AssignArticleForm members={members} defaultSeasonYear={new Date().getFullYear()} />
              <ArticlesList articles={allArticles || []} members={members} />
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
