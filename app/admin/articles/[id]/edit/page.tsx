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

  // Editor ergonomics data: teams for the team-name picker, last-locked-week records to
  // auto-fill on selection, and a candidate earlier article to copy slot labels from. All three
  // depend on the article's season/week/kind (just fetched above) but not on each other, so they
  // run together rather than one sequential round trip apiece.
  const [teamsRes, prevPollWeekRes, prevArticleRes] = await Promise.all([
    supabase.from('teams').select('*').eq('season_year', articleFields.season_year).order('name'),
    supabase
      .from('poll_weeks')
      .select('id')
      .eq('season_year', articleFields.season_year)
      .eq('week_number', articleFields.week_number - 1)
      .maybeSingle(),
    supabase
      .from('articles')
      .select('id')
      .eq('season_year', articleFields.season_year)
      .eq('kind', articleFields.kind)
      .lt('week_number', articleFields.week_number)
      .order('week_number', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (teamsRes.error) {
    console.error('Failed to load teams:', teamsRes.error)
  }
  const teamsForSeason = teamsRes.data ?? []

  if (prevPollWeekRes.error) {
    console.error('Failed to load prior poll week:', prevPollWeekRes.error)
  }
  if (prevArticleRes.error) {
    console.error('Failed to load prior article for slot-copy:', prevArticleRes.error)
  }

  let teamRecords: Record<string, string> = {}
  if (prevPollWeekRes.data) {
    const { data: prevResults, error: prevResultsError } = await supabase
      .from('poll_results')
      .select('team_id, team_record')
      .eq('poll_week_id', prevPollWeekRes.data.id)

    if (prevResultsError) {
      console.error('Failed to load prior-week team records:', prevResultsError)
    } else {
      teamRecords = Object.fromEntries(
        (prevResults ?? [])
          .filter((r) => r.team_record)
          .map((r) => [r.team_id, r.team_record as string])
      )
    }
  }

  return (
    <div className="py-12 max-w-4xl mx-auto">
      <AdminSubNav active="articles" showManage={showManageLink} />
      <ArticleEditor
        article={articleFields}
        matchups={matchups}
        isCommissioner={showManageLink}
        teamsForSeason={teamsForSeason}
        teamRecords={teamRecords}
        copyFromArticleId={prevArticleRes.data?.id ?? null}
      />
    </div>
  )
}
