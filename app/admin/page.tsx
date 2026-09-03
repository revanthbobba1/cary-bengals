import { genPageMetadata } from 'app/seo'
import { createClient } from '@/lib/supabase/server'
import { isCommissioner } from '@/lib/supabase/roles'
import { formatDeadline } from '@/lib/formatDeadline'
import type { PollWeek, SubmissionStatus } from '@/lib/types/poll'
import Link from 'next/link'
import AdminSubNav from '@/components/AdminSubNav'

// Real name is only available when a user logged in via Google OAuth; email/password
// accounts created via Dashboard invite have no name set. Email is always present, so
// it's the reliable fallback (local part only) before finally falling back to a fixed string.
function getDisplayName(
  fullName: string | null | undefined,
  email: string | null | undefined,
  fallback: string
): string {
  return fullName || email?.split('@')[0] || fallback
}

export const metadata = genPageMetadata({ title: 'Admin Dashboard' })

export default async function AdminPage() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const displayName = getDisplayName(user?.user_metadata?.full_name, user?.email, 'Admin')

  // Get current open poll week
  const { data: openWeek } = await supabase
    .from('poll_weeks')
    .select('*')
    .eq('is_locked', false)
    .gte('deadline', new Date().toISOString())
    .order('deadline', { ascending: true })
    .limit(1)
    .maybeSingle()

  const showManageLink = isCommissioner(user)

  // Shared by both the personal card and the commissioner list below — both need "how many
  // teams make up this season's full roster" to tell a genuinely current submission apart
  // from a stale one left over from before the roster grew (see migration 024). Compares
  // against the season's actual team count rather than a hardcoded 12 — matches
  // get_poll_week_submission_status (017), which already does this correctly. `null` means
  // the count is genuinely unknown (query failed), not that the roster is empty — treated
  // as "can't tell" everywhere below rather than silently defaulting to 0, which would
  // misreport a transient DB error as "the roster changed" or falsely mark a non-submitter
  // as having submitted.
  let resolvedTeamCount: number | null = null
  if (openWeek) {
    const { count: teamCount, error: teamCountError } = await supabase
      .from('teams')
      .select('id', { count: 'exact', head: true })
      .eq('season_year', openWeek.season_year)

    if (teamCountError) {
      console.error('Failed to load team count:', teamCountError)
    } else {
      resolvedTeamCount = teamCount ?? 0
    }
  }

  let submissionStatus: {
    week: PollWeek
    hasSubmitted: boolean
    submittedAt?: string
    submissionCount: number
    teamCount: number | null
  } | null = null

  if (openWeek && user) {
    const { data: userSubmissions, error: submissionError } = await supabase
      .from('poll_submissions')
      .select('submitted_at, rank')
      .eq('poll_week_id', openWeek.id)
      .eq('user_id', user.id)

    if (submissionError) {
      console.error('Failed to load submission status:', submissionError)
    }

    // Matches get_poll_week_submission_status's (017) floor-of-1 threshold, so a genuinely
    // empty roster doesn't trivially read as "submitted" via 0 >= 0.
    submissionStatus = {
      week: openWeek,
      hasSubmitted:
        !!userSubmissions &&
        resolvedTeamCount !== null &&
        userSubmissions.length >= Math.max(resolvedTeamCount, 1),
      submittedAt: userSubmissions?.[0]?.submitted_at,
      submissionCount: userSubmissions?.length || 0,
      teamCount: resolvedTeamCount,
    }
  }

  // League-wide "who has/hasn't submitted" — commissioner only. The RPC itself enforces the
  // commissioner check server-side (SECURITY DEFINER function reading the JWT), this is just
  // avoiding a pointless call for members who'd get an error back anyway.
  let leagueStatus: SubmissionStatus[] | null = null
  let leagueStatusError = false
  if (openWeek && showManageLink) {
    const { data: statusRows, error: statusError } = await supabase.rpc(
      'get_poll_week_submission_status',
      { p_poll_week_id: openWeek.id }
    )

    if (statusError) {
      console.error('Failed to load league submission status:', statusError)
      leagueStatusError = true
    } else {
      leagueStatus = statusRows
    }
  }

  return (
    <div>
      <div className="space-y-2 pb-8 pt-6 md:space-y-5">
        <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-ink dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
          Admin Dashboard
        </h1>
        <p className="text-lg leading-7 text-gray-500 dark:text-gray-400">
          Welcome, {displayName}.
        </p>
      </div>

      <AdminSubNav active="dashboard" showManage={showManageLink} />

      {/* Each admin feature gets its own labeled section here. As more admin
          features are added, they should follow this same "section with an
          <h2> label + one or more cards" pattern rather than being appended
          to a single flat block. Member-facing and commissioner-only content
          get entirely separate sections (not just separate cards within one
          section) so it's unambiguous which parts of the page are "things
          every member checks" vs. "things only the commissioner checks". */}
      <div className="space-y-12 py-8">
        <section aria-labelledby="poll-section-heading">
          <h2
            id="poll-section-heading"
            className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Poll
          </h2>

          <div className="rounded-card border border-gray-200 bg-white p-6 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark">
            {submissionStatus ? (
              <>
                <h3 className="text-xl font-bold mb-4">
                  Week {submissionStatus.week.week_number} Poll Status
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Deadline: {formatDeadline(submissionStatus.week.deadline)}
                </p>

                {submissionStatus.teamCount === null ? (
                  <div className="mb-6 rounded-control bg-gray-50 p-4 dark:bg-gray-800/40">
                    <p className="text-gray-600 dark:text-gray-400 font-medium">
                      Couldn't verify your submission status — try refreshing the page.
                    </p>
                  </div>
                ) : submissionStatus.hasSubmitted ? (
                  <div className="mb-6 rounded-control bg-green-50 p-4 dark:bg-green-900/20">
                    <p className="text-green-700 dark:text-green-400 font-medium">
                      ✓ You have submitted your rankings
                    </p>
                    {submissionStatus.submittedAt && (
                      <p className="text-sm text-green-600 dark:text-green-500 mt-1">
                        Submitted: {formatDeadline(submissionStatus.submittedAt)}
                      </p>
                    )}
                  </div>
                ) : submissionStatus.submissionCount > 0 ? (
                  // The RPC always writes a complete ballot (submit_poll_ballot rejects a
                  // count mismatch), so a stored count below the current (known) team count
                  // only happens when the roster grew after this member last submitted — a
                  // stale ballot, not a partial one.
                  <div className="mb-6 rounded-control bg-yellow-50 p-4 dark:bg-yellow-900/20">
                    <p className="text-yellow-700 dark:text-yellow-400 font-medium">
                      ⚠ Your rankings need updating ({submissionStatus.submissionCount}/
                      {submissionStatus.teamCount} teams ranked) — the roster has changed since you
                      last submitted
                    </p>
                  </div>
                ) : (
                  <div className="mb-6 rounded-control bg-yellow-50 p-4 dark:bg-yellow-900/20">
                    <p className="text-yellow-700 dark:text-yellow-400 font-medium">
                      ⚠ You have not submitted your rankings yet
                    </p>
                  </div>
                )}

                <Link
                  href="/admin/poll"
                  className="inline-flex items-center rounded-full bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_16px_-4px_rgba(249,115,22,0.4)] transition-all duration-150 ease-out-expo hover:-translate-y-px hover:bg-primary-600 hover:shadow-[0_8px_20px_-4px_rgba(249,115,22,0.5)] active:scale-[0.97]"
                >
                  {submissionStatus.hasSubmitted ? 'Edit Your Rankings' : 'Submit Rankings'}
                </Link>
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold mb-4">Poll Status</h3>
                <p className="text-gray-600 dark:text-gray-400">No active poll at this time.</p>
              </>
            )}
          </div>
        </section>

        {/* Commissioner-only section. Everything a commissioner needs to check that a regular
            member never sees lives here — a single place to look, rather than scattered
            per-card badges that are easy to forget to add consistently (as happened when the
            submission-status list below was first added without one). */}
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

            {/* No "Manage Poll Weeks" card here on purpose — that's exactly what the
                "Manage Poll Weeks" tab in AdminSubNav already navigates to, and a static
                description + link would add nothing beyond what the tab label already
                says. This section is for live, dashboard-only oversight content instead
                (things with no dedicated tab of their own), not a second copy of navigation. */}
            {leagueStatus && leagueStatus.length > 0 ? (
              <div className="rounded-card border border-gray-200 bg-white p-6 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark">
                <h3 className="text-lg font-semibold mb-4">
                  Week {openWeek?.week_number} Submission Status (
                  {leagueStatus.filter((row) => row.has_submitted).length}/{leagueStatus.length})
                </h3>
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {leagueStatus.map((row) => (
                    <li
                      key={row.user_id}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <span>{getDisplayName(row.full_name, row.email, 'Unknown member')}</span>
                      {row.has_submitted ? (
                        <span className="text-green-600 dark:text-green-400">✓ Submitted</span>
                      ) : row.submission_count > 0 && resolvedTeamCount !== null ? (
                        // Same "stale, not partial" reasoning as the personal card above —
                        // get_poll_week_submission_status (017) uses the identical
                        // count >= team_count threshold for has_submitted.
                        <span className="text-yellow-600 dark:text-yellow-400">
                          Needs update ({row.submission_count}/{resolvedTeamCount})
                        </span>
                      ) : (
                        <span className="text-gray-400">Not submitted</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : leagueStatusError ? (
              <p className="text-sm text-red-600 dark:text-red-400">
                Couldn't load submission status right now — try refreshing the page.
              </p>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No poll is currently open, so there's no submission status to show. Manage poll
                weeks from the tab above.
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
