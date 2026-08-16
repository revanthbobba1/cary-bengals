import { genPageMetadata } from 'app/seo'
import { createClient } from '@/lib/supabase/server'
import { isCommissioner } from '@/lib/supabase/roles'
import type { PollWeek } from '@/lib/types/poll'
import Link from 'next/link'
import AdminSubNav from '@/components/AdminSubNav'

// Helper to format date consistently on server and client
function formatDeadline(isoString: string): string {
  const date = new Date(isoString)
  const month = date.getMonth() + 1
  const day = date.getDate()
  const year = date.getFullYear()
  const hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12

  return `${month}/${day}/${year} at ${displayHours}:${minutes} ${ampm}`
}

export const metadata = genPageMetadata({ title: 'Admin Dashboard' })

export default async function AdminPage() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Real name is only available when the user logged in via Google OAuth;
  // email/password accounts created via Dashboard invite have no name set.
  // Email is always present, so it's the reliable fallback.
  const displayName = user?.user_metadata?.full_name || user?.email || 'Admin'

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

  let submissionStatus: {
    week: PollWeek
    hasSubmitted: boolean
    submittedAt?: string
    submissionCount: number
  } | null = null

  if (openWeek && user) {
    // Check if current user has submitted
    const { data: userSubmissions, error: submissionError } = await supabase
      .from('poll_submissions')
      .select('submitted_at, rank')
      .eq('poll_week_id', openWeek.id)
      .eq('user_id', user.id)

    if (submissionError) {
      console.error('Failed to load submission status:', submissionError)
    }

    submissionStatus = {
      week: openWeek,
      hasSubmitted: !!userSubmissions && userSubmissions.length === 12, // Should have 12 submissions
      submittedAt: userSubmissions?.[0]?.submitted_at,
      submissionCount: userSubmissions?.length || 0,
    }
  }

  return (
    <div>
      <div className="space-y-2 pb-8 pt-6 md:space-y-5">
        <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
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
          to a single flat block. */}
      <div className="space-y-12 py-8">
        <section aria-labelledby="poll-section-heading">
          <h2
            id="poll-section-heading"
            className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Poll
          </h2>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Member workflow: participate in the poll. This is the primary,
                highest-weight action for every member, so it takes the wider
                column and the primary button treatment. */}
            <div className="lg:col-span-2 p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
              {submissionStatus ? (
                <>
                  <h3 className="text-xl font-bold mb-4">
                    Week {submissionStatus.week.week_number} Poll Status
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    Deadline: {formatDeadline(submissionStatus.week.deadline)}
                  </p>

                  {submissionStatus.hasSubmitted ? (
                    <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-md">
                      <p className="text-green-700 dark:text-green-400 font-medium">
                        ✓ You have submitted your rankings ({submissionStatus.submissionCount}/12
                        teams)
                      </p>
                      {submissionStatus.submittedAt && (
                        <p className="text-sm text-green-600 dark:text-green-500 mt-1">
                          Submitted: {formatDeadline(submissionStatus.submittedAt)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
                      <p className="text-yellow-700 dark:text-yellow-400 font-medium">
                        ⚠ You have not submitted your rankings yet
                        {submissionStatus.submissionCount > 0 &&
                          ` (Partial: ${submissionStatus.submissionCount}/12 teams)`}
                      </p>
                    </div>
                  )}

                  <Link
                    href="/admin/poll"
                    className="inline-block rounded-md bg-primary-500 px-4 py-2 text-white font-medium hover:bg-primary-600"
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

            {/* Commissioner workflow: administer the poll. Visually distinct
                (bordered, muted card + badge) from the member card above so
                it reads as a different kind of action, not a peer button.
                Only rendered for commissioners. */}
            {showManageLink && (
              <div className="p-6 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700">
                <span className="inline-block mb-3 rounded-full bg-gray-200 dark:bg-gray-700 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                  Commissioner
                </span>
                <h3 className="text-lg font-semibold mb-2">Manage Poll Weeks</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Create poll weeks, edit deadlines, and lock or unlock submissions.
                </p>
                <Link
                  href="/admin/poll/manage"
                  className="inline-block rounded-md bg-gray-600 px-4 py-2 text-white font-medium hover:bg-gray-700 dark:bg-gray-600 dark:hover:bg-gray-500"
                >
                  Manage Poll Weeks
                </Link>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
