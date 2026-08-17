'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { PollWeek } from '@/lib/types/poll'

interface Props {
  existingWeeks: PollWeek[]
}

export default function PollWeekManager({ existingWeeks }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear())
  const [weekNumber, setWeekNumber] = useState(1)
  const [deadline, setDeadline] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingWeekId, setEditingWeekId] = useState<string | null>(null)
  const [editDeadline, setEditDeadline] = useState('')

  const toDatetimeLocal = (iso: string) => {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const handleCreateWeek = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error: insertError } = await supabase.from('poll_weeks').insert({
        season_year: seasonYear,
        week_number: weekNumber,
        deadline: new Date(deadline).toISOString(),
        is_locked: false,
      })

      if (insertError) throw insertError

      router.refresh()
      setWeekNumber((prev) => prev + 1)
      setDeadline('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create poll week')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateDeadline = async (weekId: string, newDeadline: string) => {
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

  return (
    <div className="space-y-8">
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
        <h2 className="text-xl font-semibold mb-4">Existing Poll Weeks</h2>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left p-2">Season</th>
              <th className="text-left p-2">Week</th>
              <th className="text-left p-2">Deadline</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2"></th>
            </tr>
          </thead>
          <tbody>
            {existingWeeks.map((week) => (
              <tr key={week.id} className="border-b border-gray-100 dark:border-gray-800">
                <td className="p-2">{week.season_year}</td>
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
                    new Date(week.deadline).toLocaleString()
                  )}
                </td>
                <td className="p-2">
                  {week.is_locked ? (
                    <span className="text-red-600">Locked</span>
                  ) : new Date(week.deadline) < new Date() ? (
                    <span className="text-yellow-600">Past deadline</span>
                  ) : (
                    <span className="text-green-600">Open</span>
                  )}
                </td>
                <td className="p-2">
                  {editingWeekId === week.id ? (
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
