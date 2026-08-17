'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { PollWeek } from '@/lib/types/poll'

interface Props {
  existingWeeks: PollWeek[]
  // Passed from the server component rather than computed with `new Date()`
  // during client render, which would disagree with the server's render time
  // by however long the request took and cause a hydration mismatch on any
  // week whose deadline falls in that window.
  now: string
}

// Deterministic formatter (matches app/admin/page.tsx) so server and client
// render the exact same string instead of relying on toLocaleString(), whose
// output can differ by environment/locale between server and browser.
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

  const handleUpdateDeadline = async (weekId: string, newDeadline: string) => {
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
        .select('id')

      if (error) throw error
      // RLS silently filters denied rows rather than erroring, so a blocked
      // update returns success with zero rows changed — check explicitly.
      if (!data || data.length === 0) throw new Error('Update was not applied')
      setEditingWeekId(null)
      router.refresh()
    } catch (err) {
      alert('Failed to update deadline')
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
        <div className="rounded-md bg-yellow-50 p-4 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
          <strong>{openWeeks.length} weeks are open at once</strong> (Week
          {openWeeks.map((w) => ` ${w.week_number}`).join(', ')}). Members only see one at a time —
          whichever has the nearest deadline
          {currentlyServedWeek && <> (currently Week {currentlyServedWeek.week_number})</>}.
        </div>
      )}

      <form
        onSubmit={handleCreateWeek}
        className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow space-y-4"
      >
        <h2 className="text-xl font-semibold">Create New Poll Week</h2>

        {error && (
          <div className="rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="season-year" className="block text-sm font-medium mb-1">
              Season Year
            </label>
            <input
              id="season-year"
              type="number"
              value={seasonYear}
              onChange={(e) => setSeasonYear(parseInt(e.target.value))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded p-2 bg-white dark:bg-gray-700"
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
              className="w-full border border-gray-300 dark:border-gray-600 rounded p-2 bg-white dark:bg-gray-700"
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
              className="w-full border border-gray-300 dark:border-gray-600 rounded p-2 bg-white dark:bg-gray-700"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-primary-500 px-4 py-2 text-white font-medium hover:bg-primary-600 disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Create Poll Week'}
        </button>
      </form>

      <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Existing Poll Weeks</h2>
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
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="border border-gray-300 dark:border-gray-600 rounded p-2 bg-white dark:bg-gray-700"
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
        <table className="w-full">
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
                        className="border border-gray-300 dark:border-gray-600 rounded p-1 bg-white dark:bg-gray-700"
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
                        {reopenError && <span className="text-sm text-red-600">{reopenError}</span>}
                        <div className="flex items-center gap-2">
                          <input
                            type="datetime-local"
                            value={reopenDeadline}
                            onChange={(e) => setReopenDeadline(e.target.value)}
                            min={toDatetimeLocal(nowIso)}
                            className="border border-gray-300 dark:border-gray-600 rounded p-1 bg-white dark:bg-gray-700"
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
                          onClick={() => handleUpdateDeadline(week.id, editDeadline)}
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
                        <button
                          type="button"
                          onClick={() => handleToggleLock(week.id, week.is_locked)}
                          className="text-sm text-primary-600 hover:underline"
                        >
                          {week.is_locked ? 'Unlock' : 'Lock'}
                        </button>
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
  )
}
