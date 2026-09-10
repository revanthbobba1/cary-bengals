import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isCommissioner } from '@/lib/supabase/roles'
import PollWeekManager from '@/components/PollWeekManager'
import EspnTeamSync from '@/components/EspnTeamSync'
import AdminSubNav from '@/components/AdminSubNav'

export default async function ManagePollPage() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirectTo=/admin/poll/manage')

  const showManageLink = isCommissioner(user)

  if (!showManageLink) {
    return (
      <div className="py-12 max-w-4xl mx-auto">
        <AdminSubNav active="manage" showManage={false} />
        <h1 className="text-2xl font-bold tracking-tight text-ink dark:text-gray-100 mb-2">
          Manage Poll Weeks
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Commissioner access required. Contact the commissioner if you believe you should have
          access to this page.
        </p>
      </div>
    )
  }

  // No limit here (unlike some other queries in this app) — the year filter in
  // PollWeekManager needs every season's weeks available to filter across, and
  // this table will never realistically be large enough to need pagination.
  const { data: pollWeeks } = await supabase
    .from('poll_weeks')
    .select('*')
    .order('season_year', { ascending: false })
    .order('week_number', { ascending: false })

  // Same "newest season present" default PollWeekManager itself falls back to for its own
  // year filter — there's no separate notion of "the current season" anywhere else to query.
  const seasonYear =
    pollWeeks && pollWeeks.length > 0
      ? Math.max(...pollWeeks.map((week) => week.season_year))
      : new Date().getFullYear()

  return (
    <div className="py-12 max-w-4xl mx-auto space-y-8">
      <div>
        <AdminSubNav active="manage" showManage={showManageLink} />
        <h1 className="text-2xl font-bold tracking-tight text-ink dark:text-gray-100 mb-6">
          Manage Poll Weeks
        </h1>
      </div>
      <EspnTeamSync seasonYear={seasonYear} />
      <PollWeekManager existingWeeks={pollWeeks || []} now={new Date().toISOString()} />
    </div>
  )
}
