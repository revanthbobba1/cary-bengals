'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { formatDeadline } from '@/lib/formatDeadline'
import type { PollWeek } from '@/lib/types/poll'

interface Props {
  existingWeeks: PollWeek[]
  // Passed from the server component rather than computed with `new Date()`
  // during client render, which would disagree with the server's render time
  // by however long the request took and cause a hydration mismatch on any
  // week whose deadline falls in that window.
  now: string
}

// Feeds a native <input type="datetime-local">, which is always interpreted
// in the browser's own local timezone — unlike formatDeadline (display-only
// text), this can't use a fixed zone without breaking the round-trip back to
// an ISO timestamp on save (new Date(value) parses using the browser's zone).
function toDatetimeLocal(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function isOpen(week: PollWeek, now: Date) {
  return !week.is_locked && new Date(week.deadline) > now
}

function isClosed(week: PollWeek, now: Date) {
  return week.is_locked || new Date(week.deadline) <= now
}

export default function PollWeekManager({ existingWeeks, now: nowIso }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const now = new Date(nowIso)

  const [seasonYear, setSeasonYear] = useState(new Date(nowIso).getFullYear())
  const [weekNumber, setWeekNumber] = useState(1)
  const [deadline, setDeadline] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingWeekId, setEditingWeekId] = useState<string | null>(null)
  const [editDeadline, setEditDeadline] = useState('')
  const [reopeningWeekId, setReopeningWeekId] = useState<string | null>(null)
  const [reopenDeadline, setReopenDeadline] = useState('')
  const [reopenError, setReopenError] = useState<string | null>(null)

  // Year filter for the table below, same idea as the public poll page's year
  // dropdown. All years are already loaded (no separate fetch needed), so this
  // is just a client-side filter, defaulting to the newest year present.
  const availableYears = [...new Set(existingWeeks.map((w) => w.season_year))].sort((a, b) => b - a)
  const [selectedYear, setSelectedYear] = useState(
    availableYears[0] ?? new Date(nowIso).getFullYear()
  )
  const weeksForSelectedYear = existingWeeks.filter((w) => w.season_year === selectedYear)

  const openWeeks = existingWeeks
    .filter((w) => isOpen(w, now))
    .sort((a, b) => a.week_number - b.week_number)
  // Matches the ordering the app's own "current open week" queries use
  // (app/admin/page.tsx, app/admin/poll/page.tsx): nearest deadline wins.
  const currentlyServedWeek = [...openWeeks].sort(
    (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
  )[0]

  const handleCreateWeek = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!deadline || new Date(deadline) <= now) {
      setError('Deadline must be in the future.')
      return
    }

    setLoading(true)
    try {
      const { error: insertError } = await supabase.from('poll_weeks').insert({
        season_year: seasonYear,
        week_number: weekNumber,
        deadline: new Date(deadline).toISOString(),
        is_locked: false,
      })

      if (insertError) throw insertError

      router.refresh()
      setSelectedYear(seasonYear)
      setWeekNumber((prev) => prev + 1)
      setDeadline('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create poll week')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateDeadline = async (weekId: string, newDeadline: string, wasLocked: boolean) => {
    if (
      new Date(newDeadline) <= now &&
      !window.confirm(
        'This deadline is in the past — the week will close to submissions immediately. Continue?'
      )
    ) {
      return
    }

    try {
      const { data, error } = await supabase
        .from('poll_weeks')
        .update({ deadline: new Date(newDeadline).toISOString() })
        .eq('id', weekId)
        // Guards against the auto-lock cron (019) locking this week between
        // the edit form opening and this save — if is_locked no longer
        // matches what it was when editing started, 0 rows update and we
        // tell the commissioner to use Reopen instead of silently leaving
        // the week locked with a newly-extended deadline.
        .eq('is_locked', wasLocked)
        .select('id')

      if (error) throw error
      // RLS silently filters denied rows rather than erroring, so a blocked
      // update returns success with zero rows changed — check explicitly.
      if (!data || data.length === 0) {
        throw new Error(
          wasLocked
            ? 'Update was not applied'
            : 'This week was auto-locked while you were editing — use Reopen instead.'
        )
      }
      setEditingWeekId(null)
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update deadline')
    }
  }

  const handleToggleLock = async (weekId: string, currentlyLocked: boolean) => {
    try {
      const { data, error } = await supabase
        .from('poll_weeks')
        .update({ is_locked: !currentlyLocked })
        .eq('id', weekId)
        .select('id')

      if (error) throw error
      if (!data || data.length === 0) throw new Error('Update was not applied')
      router.refresh()
    } catch (err) {
      alert('Failed to update lock status')
    }
  }

  // Reopening a week that's both locked and past deadline used to require two
  // separate edits (unlock, then extend the deadline) with no indication both
  // were needed. This does it in one action/one update.
  const handleReopen = async (weekId: string, newDeadline: string) => {
    setReopenError(null)

    if (!newDeadline || new Date(newDeadline) <= now) {
      setReopenError('New deadline must be in the future.')
      return
    }

    try {
      const { data, error } = await supabase
        .from('poll_weeks')
        .update({ is_locked: false, deadline: new Date(newDeadline).toISOString() })
        .eq('id', weekId)
        .select('id')

      if (error) throw error
      if (!data || data.length === 0) throw new Error('Update was not applied')
      setReopeningWeekId(null)
      router.refresh()
    } catch (err) {
      setReopenError('Failed to reopen this week.')
    }
  }

  return (
    <div className="space-y-8">
      {openWeeks.length > 1 && (
        <div className="rounded-control bg-yellow-50 p-4 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
          <strong>{openWeeks.length} weeks are open at once</strong> (Week
          {openWeeks.map((w) => ` ${w.week_number}`).join(', ')}). Members only see one at a time —
          whichever has the nearest deadline
          {currentlyServedWeek && <> (currently Week {currentlyServedWeek.week_number})</>}.
        </div>
      )}

      <form
        onSubmit={handleCreateWeek}
        className="space-y-4 rounded-card border border-gray-200 bg-white p-6 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark"
      >
        <h2 className="text-xl font-semibold text-ink dark:text-gray-100">Create New Poll Week</h2>

        {error && (
          <div className="rounded-control bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="season-year" className="block text-sm font-medium mb-1">
              Season Year
            </label>
            <input
              id="season-year"
              type="number"
              value={seasonYear}
              onChange={(e) => setSeasonYear(parseInt(e.target.value))}
              className="w-full rounded-control border border-gray-200 bg-white p-2 text-gray-900 shadow-card transition-shadow duration-150 ease-out-expo focus:border-accent-500 focus:shadow-raised focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:shadow-card-dark"
            />
          </div>

          <div>
            <label htmlFor="week-number" className="block text-sm font-medium mb-1">
              Week Number
            </label>
            <input
              id="week-number"
              type="number"
              value={weekNumber}
              onChange={(e) => setWeekNumber(parseInt(e.target.value))}
              min={1}
              className="w-full rounded-control border border-gray-200 bg-white p-2 text-gray-900 shadow-card transition-shadow duration-150 ease-out-expo focus:border-accent-500 focus:shadow-raised focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:shadow-card-dark"
            />
          </div>

          <div>
            <label htmlFor="deadline" className="block text-sm font-medium mb-1">
              Deadline
            </label>
            <input
              id="deadline"
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              min={toDatetimeLocal(nowIso)}
              required
              className="w-full rounded-control border border-gray-200 bg-white p-2 text-gray-900 shadow-card transition-shadow duration-150 ease-out-expo focus:border-accent-500 focus:shadow-raised focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:shadow-card-dark"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_16px_-4px_rgba(249,115,22,0.4)] transition-all duration-150 ease-out-expo hover:-translate-y-px hover:bg-primary-600 hover:shadow-[0_8px_20px_-4px_rgba(249,115,22,0.5)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Create Poll Week'}
        </button>
      </form>

      <div className="rounded-card border border-gray-200 bg-white p-6 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-ink dark:text-gray-100">Existing Poll Weeks</h2>
          {availableYears.length > 1 && (
            <div>
              <label
                htmlFor="manage-year-select"
                className="text-sm text-gray-600 dark:text-gray-300 mr-2"
              >
                Season:
              </label>
              <select
                id="manage-year-select"
                value={selectedYear}
                onChange={(e) => {
                  setSelectedYear(Number(e.target.value))
                  // An in-progress edit/reopen form for a week that's about to be
                  // filtered out shouldn't persist invisibly and reappear (in its
                  // stale state) if the commissioner switches the filter back.
                  setEditingWeekId(null)
                  setReopeningWeekId(null)
                  setReopenError(null)
                }}
                className="rounded-control border border-gray-200 bg-white p-2 text-gray-900 shadow-card transition-shadow duration-150 ease-out-expo focus:border-accent-500 focus:shadow-raised focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:shadow-card-dark"
              >
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {/* Four columns plus multi-button action cells and a long status string
            ("Closed: deadline passed — extend deadline to reopen") don't fit a
            phone-width viewport — scroll the table horizontally within its own
            box rather than letting it overflow the page. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left p-2">Week</th>
                <th className="text-left p-2">Deadline</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2"></th>
              </tr>
            </thead>
            <tbody>
              {weeksForSelectedYear.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-2 text-center text-gray-500 dark:text-gray-400">
                    No poll weeks for {selectedYear}.
                  </td>
                </tr>
              )}
              {weeksForSelectedYear.map((week) => {
                const closed = isClosed(week, now)
                const needsReopen = week.is_locked && new Date(week.deadline) <= now

                return (
                  <tr key={week.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="p-2">{week.week_number}</td>
                    <td className="p-2">
                      {editingWeekId === week.id ? (
                        <input
                          type="datetime-local"
                          value={editDeadline}
                          onChange={(e) => setEditDeadline(e.target.value)}
                          className="rounded-control border border-gray-200 bg-white p-1 text-gray-900 shadow-card transition-shadow duration-150 ease-out-expo focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:shadow-card-dark"
                        />
                      ) : (
                        formatDeadline(week.deadline)
                      )}
                    </td>
                    <td className="p-2">
                      {week.is_locked ? (
                        <span className="text-red-600">
                          Locked{new Date(week.deadline) > now ? ' — unlock to reopen' : ''}
                        </span>
                      ) : closed ? (
                        <span className="text-yellow-600">
                          Closed: deadline passed — extend deadline to reopen
                        </span>
                      ) : (
                        <span className="text-green-600">Open</span>
                      )}
                    </td>
                    <td className="p-2">
                      {reopeningWeekId === week.id ? (
                        <div className="flex flex-col gap-2">
                          {reopenError && (
                            <span className="text-sm text-red-600">{reopenError}</span>
                          )}
                          <div className="flex items-center gap-2">
                            <input
                              type="datetime-local"
                              value={reopenDeadline}
                              onChange={(e) => setReopenDeadline(e.target.value)}
                              min={toDatetimeLocal(nowIso)}
                              className="rounded-control border border-gray-200 bg-white p-1 text-gray-900 shadow-card transition-shadow duration-150 ease-out-expo focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:shadow-card-dark"
                            />
                            <button
                              type="button"
                              onClick={() => handleReopen(week.id, reopenDeadline)}
                              className="text-sm text-primary-600 hover:underline"
                            >
                              Reopen
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setReopeningWeekId(null)
                                setReopenError(null)
                              }}
                              className="text-sm text-gray-500 hover:underline"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : editingWeekId === week.id ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateDeadline(week.id, editDeadline, week.is_locked)
                            }
                            className="text-sm text-primary-600 hover:underline"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingWeekId(null)}
                            className="text-sm text-gray-500 hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-3">
                          {needsReopen && (
                            <button
                              type="button"
                              onClick={() => {
                                setReopeningWeekId(week.id)
                                setReopenDeadline('')
                                setReopenError(null)
                              }}
                              className="text-sm font-medium text-primary-600 hover:underline"
                            >
                              Reopen
                            </button>
                          )}
                          {/* Editing just the deadline on a week that's still locked wouldn't
                              actually reopen it — is_locked stays true either way, so
                              submissions would remain blocked regardless of what the deadline
                              says. Reopen (above) is the only action that does anything real
                              once a week is both locked and past-deadline. */}
                          {!needsReopen && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingWeekId(week.id)
                                setEditDeadline(toDatetimeLocal(week.deadline))
                              }}
                              className="text-sm text-primary-600 hover:underline"
                            >
                              Edit deadline
                            </button>
                          )}
                          {/* Once past deadline, a plain Unlock would just get auto-locked
                              again within minutes (see 019_auto_lock_expired_weeks.sql) unless
                              the deadline is also extended — Reopen (above) does both in one
                              step, so it's the only unlock path offered here. */}
                          {!needsReopen && (
                            <button
                              type="button"
                              onClick={() => handleToggleLock(week.id, week.is_locked)}
                              className="text-sm text-primary-600 hover:underline"
                            >
                              {week.is_locked ? 'Unlock' : 'Lock'}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
