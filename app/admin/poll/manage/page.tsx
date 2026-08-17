import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isCommissioner } from '@/lib/supabase/roles'
import PollWeekManager from '@/components/PollWeekManager'
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
        <h1 className="text-2xl font-bold mb-2">Manage Poll Weeks</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Commissioner access required. Contact the commissioner if you believe you should have
          access to this page.
        </p>
      </div>
    )
  }

  const { data: pollWeeks } = await supabase
    .from('poll_weeks')
    .select('*')
    .order('season_year', { ascending: false })
    .order('week_number', { ascending: false })
    .limit(10)

  return (
    <div className="py-12 max-w-4xl mx-auto">
      <AdminSubNav active="manage" showManage={showManageLink} />
      <h1 className="text-2xl font-bold mb-6">Manage Poll Weeks</h1>
      <PollWeekManager existingWeeks={pollWeeks || []} />
    </div>
  )
}
