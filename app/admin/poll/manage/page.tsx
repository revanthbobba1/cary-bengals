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

  return (
    <div className="py-12 max-w-4xl mx-auto space-y-8">
      <div>
        <AdminSubNav active="manage" showManage={showManageLink} />
        <h1 className="text-2xl font-bold tracking-tight text-ink dark:text-gray-100 mb-6">
          Manage Poll Weeks
        </h1>
      </div>
      {/* The real calendar year, matching PollWeekManager's own "Create New Poll Week" default
          (components/PollWeekManager.tsx) rather than the newest season_year already present in
          poll_weeks — those two disagree exactly when they'd matter most: at the start of a new
          season, before that season's poll weeks exist yet, which is also the most realistic time
          to run an ESPN sync. The season field here is editable regardless, so this is just the
          better default, not the only source of truth. */}
      <EspnTeamSync initialSeasonYear={new Date().getFullYear()} />
      <PollWeekManager existingWeeks={pollWeeks || []} now={new Date().toISOString()} />
    </div>
  )
}
