import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isCommissioner } from '@/lib/supabase/roles'
import PollWeekManager from '@/components/PollWeekManager'
import EspnTeamSync from '@/components/EspnTeamSync'
import EspnDataRefresh from '@/components/EspnDataRefresh'
import PressConferenceManager from '@/components/PressConferenceManager'
import AdminSubNav from '@/components/AdminSubNav'
import PollWeekSelect from '@/components/PollWeekSelect'
import SubmissionStatusList from '@/components/SubmissionStatusList'
import CommissionerSectionNav, {
  commissionerSections,
  type CommissionerSection,
} from '@/components/CommissionerSectionNav'
import type { SubmissionStatus } from '@/lib/types/poll'

export default async function CommissionerToolsPage({
  searchParams,
}: {
  searchParams: { section?: string; week?: string }
}) {
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
  // PollWeekManager / PressConferenceManager needs every season's rows available to filter
  // across, and neither table will realistically grow large enough to need pagination.
  // The queries are independent, so they run together rather than one sequential round
  // trip apiece -- same reasoning as app/admin/articles/page.tsx's Promise.all.
  const now = new Date().toISOString()
  const [{ data: pollWeeks }, { data: pressConferences }, { data: openWeek }] = await Promise.all([
    supabase
      .from('poll_weeks')
      .select('*')
      .order('season_year', { ascending: false })
      .order('week_number', { ascending: false }),
    supabase
      .from('press_conferences')
      .select('*')
      .order('season_year', { ascending: false })
      .order('week_number', { ascending: false }),
    supabase
      .from('poll_weeks')
      .select('*')
      .eq('is_locked', false)
      .gte('deadline', now)
      .order('deadline', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  // The week shown in the submission status card: the one picked via ?week=, else the open
  // week, else the most recent one (pollWeeks is newest-first). An unrecognized id falls back
  // rather than erroring.
  const selectedWeek =
    pollWeeks?.find((w) => w.id === searchParams.week) ?? openWeek ?? pollWeeks?.[0]

  // Which tab is showing; unknown values fall back to the first. Only the Poll tab needs the
  // ballot queries below, so the other tabs skip them.
  const section: CommissionerSection =
    commissionerSections.find((s) => s.id === searchParams.section)?.id ?? 'poll'

  // League-wide "who has/hasn't submitted" for the selected week. The RPC enforces the commissioner
  // check server-side; the team count lets a stale ballot (roster grew since submission, see
  // migration 024) read as "Needs update" instead of "Not submitted". `null` count means the
  // query failed, not that the roster is empty.
  let leagueStatus: SubmissionStatus[] | null = null
  let leagueStatusError = false
  let teamCount: number | null = null
  // user_id -> team names in rank order. Readable only by the commissioner (RLS policy
  // "Commissioner can view all submissions", migration 010); this page is also role-gated above.
  const ballotsByUser = new Map<string, string[]>()
  let ballotsError = false
  if (section === 'poll' && selectedWeek) {
    const [statusRes, teamsRes, submissionsRes] = await Promise.all([
      supabase.rpc('get_poll_week_submission_status', { p_poll_week_id: selectedWeek.id }),
      supabase.from('teams').select('id, name').eq('season_year', selectedWeek.season_year),
      supabase
        .from('poll_submissions')
        .select('user_id, team_id, rank')
        .eq('poll_week_id', selectedWeek.id)
        .order('rank', { ascending: true }),
    ])
    // Without team names every ranking would read "Unknown team", so a failure in either query
    // hides the rankings (and says so) rather than showing misleading ones.
    if (submissionsRes.error || teamsRes.error) {
      ballotsError = true
      if (submissionsRes.error) console.error('Failed to load ballots:', submissionsRes.error)
    } else {
      const teamNames = new Map((teamsRes.data ?? []).map((t) => [t.id, t.name]))
      for (const row of submissionsRes.data ?? []) {
        const names = ballotsByUser.get(row.user_id) ?? []
        names.push(teamNames.get(row.team_id) ?? 'Unknown team')
        ballotsByUser.set(row.user_id, names)
      }
    }
    if (statusRes.error) {
      console.error('Failed to load league submission status:', statusRes.error)
      leagueStatusError = true
    } else {
      leagueStatus = statusRes.data
    }
    if (teamsRes.error) {
      console.error('Failed to load team count:', teamsRes.error)
    } else {
      teamCount = teamsRes.data?.length ?? 0
    }
  }

  return (
    <div className="py-12 max-w-4xl mx-auto">
      <div>
        <AdminSubNav active="commissioner" showCommissionerTools={showCommissionerTools} />
        <h1 className="text-2xl font-bold tracking-tight text-ink dark:text-gray-100 mb-6">
          Commissioner Tools
        </h1>
      </div>

      {/* One tab per kind of commissioner work (see CommissionerSectionNav), so the page isn't
          one long list. New commissioner tools belong in one of these tabs (or a new one),
          not on the dashboard. */}
      <CommissionerSectionNav active={section} />

      <div>
        {section === 'poll' && (
          <div className="space-y-6">
            {selectedWeek && leagueStatus && leagueStatus.length > 0 ? (
              <div className="rounded-card border border-gray-200 bg-white p-6 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold">
                    Week {selectedWeek.week_number} Submission Status (
                    {leagueStatus.filter((row) => row.has_submitted).length}/{leagueStatus.length})
                  </h3>
                  <PollWeekSelect weeks={pollWeeks ?? []} selectedId={selectedWeek.id} />
                </div>
                <SubmissionStatusList
                  key={selectedWeek.id}
                  rows={leagueStatus}
                  teamCount={teamCount}
                  ballotsError={ballotsError}
                  ballotsByUser={Object.fromEntries(ballotsByUser)}
                />
              </div>
            ) : leagueStatusError ? (
              <p className="text-sm text-red-600 dark:text-red-400">
                Couldn't load submission status right now — try refreshing the page.
              </p>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No poll weeks yet, so there's no submission status to show.
              </p>
            )}
            <PollWeekManager existingWeeks={pollWeeks || []} now={now} />
          </div>
        )}

        {section === 'press' && (
          <PressConferenceManager existingConferences={pressConferences || []} />
        )}

        {section === 'espn' && (
          <>
            {/* The real calendar year, matching PollWeekManager's own "Create New Poll Week"
              default rather than the newest season_year already present in poll_weeks — those
              two disagree at the start of a new season, before that season's poll weeks exist,
              which is also the most realistic time to run an ESPN sync. The season field is
              editable regardless, so this is just the better default. */}
            <EspnTeamSync initialSeasonYear={new Date().getFullYear()} />
            <div className="mt-6">
              <EspnDataRefresh seasonYear={new Date().getFullYear()} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
