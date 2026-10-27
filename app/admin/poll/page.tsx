import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isCommissioner } from '@/lib/supabase/roles'
import { formatDeadline } from '@/lib/formatDeadline'
import PollSubmissionForm from '@/components/PollSubmissionForm'
import AdminSubNav from '@/components/AdminSubNav'
import { loadScheduleData, type ScheduleData } from '@/lib/espn/scheduleData'
import MatchupList from '@/components/MatchupList'
import siteMetadata from '@/data/siteMetadata'

const emptyScheduleData: ScheduleData = {
  currentWeek: null,
  teamNameById: {},
  teamLogoById: {},
  matchups: [],
}

export default async function AdminPollPage() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirectTo=/admin/poll')

  const showCommissionerTools = isCommissioner(user)

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
        <AdminSubNav active="poll" showCommissionerTools={showCommissionerTools} />
        <h1 className="text-2xl font-bold tracking-tight text-ink dark:text-gray-100 mb-4">
          Submit Poll Rankings
        </h1>
        <p>No poll is currently open for submissions.</p>
      </div>
    )
  }

  // Teams, the prior-week rank lookup, this user's existing submission, and the ESPN schedule
  // data (for the "last week's matchups" preview below) are all independent of each other -- run
  // them together instead of one sequential round trip apiece, which was the biggest contributor
  // to this page feeling slow.
  const [
    { data: teams },
    { data: existingSubmission },
    { data: previousWeekResults },
    scheduleData,
  ] = await Promise.all([
    // Get teams for this season -- wins/losses/ties come from here now (ESPN-synced), not
    // from last week's poll_results, which only ever echoed back whatever a voter was shown.
    // Keyed by `openWeek.season_year`, not `siteMetadata.currentSeason` like the scheduleData
    // fetch below -- this team list backs the actual ranking form for this poll week, so it must
    // match the poll week's own season, independent of whatever the ESPN pipeline's season
    // happens to be at the moment. Looks like a duplicate of scheduleData's own teams query, but
    // merging them would reintroduce the season-mismatch risk explained below.
    supabase.from('teams').select('*').eq('season_year', openWeek.season_year).order('name'),
    // Check if user has already submitted
    supabase
      .from('poll_submissions')
      .select('id, team_id, rank')
      .eq('poll_week_id', openWeek.id)
      .eq('user_id', user.id),
    // Get each team's prior rank from last week's results (if available), to pre-order teams
    // with no existing submission -- a genuine two-step chain (need the previous week's id
    // before its results), so this one branch still pays two sequential round trips, but no
    // longer blocks the two queries above.
    (async () => {
      const prevWeekData = await supabase
        .from('poll_weeks')
        .select('id')
        .eq('season_year', openWeek.season_year)
        .eq('week_number', openWeek.week_number - 1)
        .maybeSingle()

      return supabase
        .from('poll_results')
        .select('team_id, final_rank')
        .eq('poll_week_id', prevWeekData?.data?.id || '')
    })(),
    // `poll_weeks.week_number` and ESPN's own NFL week (`espn_schedule_state.current_week`) are
    // deliberately decoupled concepts (see docs/ESPN_INTEGRATION_PLAN.md's Phase 8c Decision 3)
    // -- the "last week's matchups" preview below is about real NFL games just played, so it's
    // sourced from the ESPN week, not derived from the poll week above. Season comes from
    // `siteMetadata.currentSeason`, not `openWeek.season_year`: every ESPN sync route and
    // /schedule itself key off that same constant, so this is the season ESPN data actually
    // exists for -- `openWeek.season_year` is a separate, commissioner-managed value that could
    // briefly diverge right at a season rollover. `.catch()` isolates this branch: this preview
    // is a nice-to-have, and a transient failure fetching it must never take down the core
    // ballot-submission page by rejecting the whole Promise.all.
    loadScheduleData(siteMetadata.currentSeason).catch((error) => {
      console.error('Failed to load ESPN schedule data for the poll page preview:', error)
      return emptyScheduleData
    }),
  ])

  const prevRankByTeam = Object.fromEntries(
    previousWeekResults?.map((r) => [r.team_id, r.final_rank]) || []
  )

  // The most recently completed NFL week (not poll week -- see the comment above), for a small
  // "what just happened" context block above the ranking form. Null/empty before any matchup has
  // ever been synced, or in week 1 when there's no previous week yet -- both cases just hide the
  // block below rather than showing an empty one.
  //
  // `scheduleData.matchups` holds the whole season (~84 rows at most), filtered down to one
  // week's handful here rather than fetched pre-filtered -- loadScheduleData's three queries run
  // in parallel with no dependency between them, and knowing which week to filter to depends on
  // the result of one of those same queries (current_week), so scoping the fetch itself would
  // mean resolving that one first and losing the parallelism for every caller, including
  // /schedule, which needs the whole season anyway. Not worth it for a table this size.
  const previousNflWeek = scheduleData.currentWeek !== null ? scheduleData.currentWeek - 1 : null
  const previousWeekMatchups =
    previousNflWeek !== null
      ? scheduleData.matchups.filter((m) => m.week_number === previousNflWeek)
      : []

  // Create a plain object of team records (not Map - Maps don't serialize to client), formatted
  // the same "W-L" / "W-L-T" shape the finalize trigger uses for poll_results.team_record.
  const teamRecords = Object.fromEntries(
    (teams || []).map((t) => [
      t.id,
      {
        record: t.ties > 0 ? `${t.wins}-${t.losses}-${t.ties}` : `${t.wins}-${t.losses}`,
        prevRank: prevRankByTeam[t.id],
      },
    ])
  )

  return (
    <div className="py-12 max-w-4xl mx-auto">
      <AdminSubNav active="poll" showCommissionerTools={showCommissionerTools} />
      <h1 className="text-2xl font-bold tracking-tight text-ink dark:text-gray-100 mb-2">
        Submit Poll Rankings
      </h1>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Season {openWeek.season_year}, Week {openWeek.week_number} - Deadline:{' '}
        {formatDeadline(openWeek.deadline)}
      </p>

      {previousWeekMatchups.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Last Week&apos;s Matchups (Week {previousNflWeek})
          </h2>
          <MatchupList
            matchups={previousWeekMatchups}
            teamNameById={scheduleData.teamNameById}
            teamLogoById={scheduleData.teamLogoById}
          />
        </div>
      )}

      <PollSubmissionForm
        pollWeek={openWeek}
        teams={teams || []}
        teamRecords={teamRecords}
        existingSubmission={existingSubmission || []}
      />
    </div>
  )
}
