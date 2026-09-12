import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isCommissioner } from '@/lib/supabase/roles'
import PollWeekManager from '@/components/PollWeekManager'
import EspnTeamSync from '@/components/EspnTeamSync'
import AdminSubNav from '@/components/AdminSubNav'

export default async function CommissionerToolsPage() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirectTo=/admin/commissioner')

  const showCommissionerTools = isCommissioner(user)

  if (!showCommissionerTools) {
    return (
      <div className="py-12 max-w-4xl mx-auto">
        <AdminSubNav active="commissioner" showCommissionerTools={false} />
        <h1 className="text-2xl font-bold tracking-tight text-ink dark:text-gray-100 mb-2">
          Commissioner Tools
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
    <div className="py-12 max-w-4xl mx-auto">
      <div>
        <AdminSubNav active="commissioner" showCommissionerTools={showCommissionerTools} />
        <h1 className="text-2xl font-bold tracking-tight text-ink dark:text-gray-100 mb-6">
          Commissioner Tools
        </h1>
      </div>

      {/* Sectioned like the dashboard (app/admin/page.tsx) — a labeled category per feature
          area rather than stacked cards with generic headings, now that this page covers two
          unrelated concerns (team identity, poll scheduling) and will likely grow a third
          (rosters/standings/schedule sync, per docs/ESPN_INTEGRATION_PLAN.md Phase 8). */}
      <div className="space-y-12">
        <section aria-labelledby="team-sync-section-heading">
          <h2
            id="team-sync-section-heading"
            className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Team Sync
          </h2>
          {/* The real calendar year, matching PollWeekManager's own "Create New Poll Week"
              default rather than the newest season_year already present in poll_weeks — those
              two disagree exactly when they'd matter most: at the start of a new season, before
              that season's poll weeks exist yet, which is also the most realistic time to run an
              ESPN sync. The season field here is editable regardless, so this is just the better
              default, not the only source of truth. */}
          <EspnTeamSync initialSeasonYear={new Date().getFullYear()} />
        </section>

        <section aria-labelledby="poll-weeks-section-heading">
          <h2
            id="poll-weeks-section-heading"
            className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Poll Weeks
          </h2>
          <PollWeekManager existingWeeks={pollWeeks || []} now={new Date().toISOString()} />
        </section>
      </div>
    </div>
  )
}
