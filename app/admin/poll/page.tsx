import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isCommissioner } from '@/lib/supabase/roles'
import { formatDeadline } from '@/lib/formatDeadline'
import PollSubmissionForm from '@/components/PollSubmissionForm'
import AdminSubNav from '@/components/AdminSubNav'

export default async function AdminPollPage() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirectTo=/admin/poll')

  const showManageLink = isCommissioner(user)

  // Get current or next open poll week
  const { data: openWeek } = await supabase
    .from('poll_weeks')
    .select('*')
    .eq('is_locked', false)
    .gte('deadline', new Date().toISOString())
    .order('deadline', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!openWeek) {
    return (
      <div className="py-12 max-w-4xl mx-auto">
        <AdminSubNav active="poll" showManage={showManageLink} />
        <h1 className="text-2xl font-bold tracking-tight text-ink dark:text-gray-100 mb-4">
          Submit Poll Rankings
        </h1>
        <p>No poll is currently open for submissions.</p>
      </div>
    )
  }

  // Get teams for this season with their current records from last week's poll
  const { data: teams } = await supabase
    .from('teams')
    .select('*')
    .eq('season_year', openWeek.season_year)
    .order('name')

  // Get team records from previous week's results (if available)
  const prevWeekData = await supabase
    .from('poll_weeks')
    .select('id')
    .eq('season_year', openWeek.season_year)
    .eq('week_number', openWeek.week_number - 1)
    .maybeSingle()

  const { data: previousWeekResults } = await supabase
    .from('poll_results')
    .select('team_id, team_record, final_rank')
    .eq('poll_week_id', prevWeekData?.data?.id || '')

  // Create a plain object of team records (not Map - Maps don't serialize to client)
  const teamRecords = Object.fromEntries(
    previousWeekResults?.map((r) => [
      r.team_id,
      { record: r.team_record, prevRank: r.final_rank },
    ]) || []
  )

  // Check if user has already submitted
  const { data: existingSubmission } = await supabase
    .from('poll_submissions')
    .select('id, team_id, rank')
    .eq('poll_week_id', openWeek.id)
    .eq('user_id', user.id)

  return (
    <div className="py-12 max-w-4xl mx-auto">
      <AdminSubNav active="poll" showManage={showManageLink} />
      <h1 className="text-2xl font-bold tracking-tight text-ink dark:text-gray-100 mb-2">
        Submit Poll Rankings
      </h1>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Season {openWeek.season_year}, Week {openWeek.week_number} - Deadline:{' '}
        {formatDeadline(openWeek.deadline)}
      </p>

      <PollSubmissionForm
        pollWeek={openWeek}
        teams={teams || []}
        teamRecords={teamRecords}
        existingSubmission={existingSubmission || []}
      />
    </div>
  )
}
