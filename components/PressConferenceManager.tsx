'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/lib/hooks/useToast'
import { focusRingClasses } from '@/lib/focusRing'
import type { PressConference } from '@/lib/types/pressConference'

interface Props {
  existingConferences: PressConference[]
}

const inputClasses =
  'w-full rounded-control border border-gray-200 bg-white p-2 text-gray-900 shadow-card transition-shadow duration-150 ease-out-expo focus:border-accent-500 focus:shadow-raised focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:shadow-card-dark'

interface FormValues {
  title: string
  description: string
  seasonYear: number
  weekNumber: number
  youtubeUrl: string
  spotifyUrl: string
}

function emptyForm(seasonYear: number, weekNumber: number): FormValues {
  return { title: '', description: '', seasonYear, weekNumber, youtubeUrl: '', spotifyUrl: '' }
}

function validate(values: FormValues): string | null {
  if (!values.title.trim()) return 'Title is required.'
  if (!Number.isInteger(values.seasonYear)) return 'Season Year must be a whole number.'
  if (!Number.isInteger(values.weekNumber) || values.weekNumber < 1 || values.weekNumber > 30) {
    return 'Week Number must be a whole number between 1 and 30.'
  }
  // Mirrors the DB's own CHECK constraint (049) so the commissioner sees a friendly message
  // instead of a raw Postgres error.
  if (!values.youtubeUrl.trim() && !values.spotifyUrl.trim()) {
    return 'Add a YouTube link, a Spotify link, or both.'
  }
  return null
}

export default function PressConferenceManager({ existingConferences }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const toast = useToast()

  const availableYears = [...new Set(existingConferences.map((c) => c.season_year))].sort(
    (a, b) => b - a
  )
  const defaultYear = availableYears[0] ?? new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(defaultYear)

  const [form, setForm] = useState<FormValues>(emptyForm(defaultYear, 1))
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FormValues>(emptyForm(defaultYear, 1))
  const [editError, setEditError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const conferencesForSelectedYear = existingConferences
    .filter((c) => c.season_year === selectedYear)
    .sort((a, b) => b.week_number - a.week_number)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError(null)

    const validationError = validate(form)
    if (validationError) {
      setCreateError(validationError)
      return
    }

    setCreating(true)
    try {
      const { error } = await supabase.from('press_conferences').insert({
        season_year: form.seasonYear,
        week_number: form.weekNumber,
        title: form.title.trim(),
        description: form.description.trim() || null,
        youtube_url: form.youtubeUrl.trim() || null,
        spotify_url: form.spotifyUrl.trim() || null,
      })
      if (error) throw error

      router.refresh()
      setSelectedYear(form.seasonYear)
      setForm(emptyForm(form.seasonYear, form.weekNumber + 1))
      toast.success(`Week ${form.weekNumber} press conference added.`)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to add press conference')
    } finally {
      setCreating(false)
    }
  }

  const startEditing = (conference: PressConference) => {
    setEditingId(conference.id)
    setEditError(null)
    setEditForm({
      title: conference.title,
      description: conference.description ?? '',
      seasonYear: conference.season_year,
      weekNumber: conference.week_number,
      youtubeUrl: conference.youtube_url ?? '',
      spotifyUrl: conference.spotify_url ?? '',
    })
  }

  const handleSaveEdit = async (id: string) => {
    setEditError(null)
    const validationError = validate(editForm)
    if (validationError) {
      setEditError(validationError)
      return
    }

    setSavingId(id)
    try {
      const { data, error } = await supabase
        .from('press_conferences')
        .update({
          season_year: editForm.seasonYear,
          week_number: editForm.weekNumber,
          title: editForm.title.trim(),
          description: editForm.description.trim() || null,
          youtube_url: editForm.youtubeUrl.trim() || null,
          spotify_url: editForm.spotifyUrl.trim() || null,
        })
        .eq('id', id)
        .select('id')

      if (error) throw error
      // RLS silently filters a denied update rather than erroring -- same gotcha other
      // admin write components in this app already guard against (see PollWeekManager).
      if (!data || data.length === 0) {
        throw new Error('Could not save -- you do not have permission to edit this entry.')
      }

      setEditingId(null)
      router.refresh()
      toast.success('Press conference updated.')
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setSavingId(null)
    }
  }

  const handleDelete = async (conference: PressConference) => {
    if (!window.confirm(`Delete "${conference.title}"? This cannot be undone.`)) {
      return
    }

    setDeletingId(conference.id)
    try {
      const { error } = await supabase.from('press_conferences').delete().eq('id', conference.id)
      if (error) throw error

      router.refresh()
      toast.success('Press conference deleted.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete press conference')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleCreate}
        className="space-y-4 rounded-card border border-gray-200 bg-white p-6 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark"
      >
        <h2 className="text-xl font-semibold text-ink dark:text-gray-100">Add Press Conference</h2>

        {createError && (
          <div className="rounded-control bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {createError}
          </div>
        )}

        <div>
          <label htmlFor="pc-title" className="block text-sm font-medium mb-1">
            Title
          </label>
          <input
            id="pc-title"
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className={inputClasses}
          />
        </div>

        <div>
          <label htmlFor="pc-description" className="block text-sm font-medium mb-1">
            Description
          </label>
          <textarea
            id="pc-description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className={inputClasses}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pc-season-year" className="block text-sm font-medium mb-1">
              Season Year
            </label>
            <input
              id="pc-season-year"
              type="number"
              value={form.seasonYear}
              onChange={(e) => setForm({ ...form, seasonYear: parseInt(e.target.value) })}
              className={inputClasses}
            />
          </div>
          <div>
            <label htmlFor="pc-week-number" className="block text-sm font-medium mb-1">
              Week Number
            </label>
            <input
              id="pc-week-number"
              type="number"
              value={form.weekNumber}
              onChange={(e) => setForm({ ...form, weekNumber: parseInt(e.target.value) })}
              className={inputClasses}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pc-youtube-url" className="block text-sm font-medium mb-1">
              YouTube URL
            </label>
            <input
              id="pc-youtube-url"
              type="url"
              placeholder="https://youtube.com/watch?v=..."
              value={form.youtubeUrl}
              onChange={(e) => setForm({ ...form, youtubeUrl: e.target.value })}
              className={inputClasses}
            />
          </div>
          <div>
            <label htmlFor="pc-spotify-url" className="block text-sm font-medium mb-1">
              Spotify URL
            </label>
            <input
              id="pc-spotify-url"
              type="url"
              placeholder="https://open.spotify.com/episode/..."
              value={form.spotifyUrl}
              onChange={(e) => setForm({ ...form, spotifyUrl: e.target.value })}
              className={inputClasses}
            />
          </div>
        </div>
        {/* No thumbnail field here on purpose -- the public page derives one from the YouTube
            link, or falls back to the site logo. See AGENTS.md / the PR description for why this
            app doesn't yet support a commissioner-uploaded thumbnail. */}

        <button
          type="submit"
          disabled={creating}
          className={`rounded-control bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 ease-out-expo hover:bg-primary-600 disabled:pointer-events-none disabled:opacity-50 ${focusRingClasses}`}
        >
          {creating ? 'Adding...' : 'Add Press Conference'}
        </button>
      </form>

      <div className="rounded-card border border-gray-200 bg-white p-6 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-ink dark:text-gray-100">
            Existing Press Conferences
          </h2>
          {availableYears.length > 0 && (
            <div>
              <label
                htmlFor="pc-year-select"
                className="text-sm text-gray-600 dark:text-gray-300 mr-2"
              >
                Season:
              </label>
              <select
                id="pc-year-select"
                value={selectedYear}
                onChange={(e) => {
                  setSelectedYear(Number(e.target.value))
                  setEditingId(null)
                }}
                className={inputClasses + ' inline-block w-auto'}
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

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left p-2">Week</th>
                <th className="text-left p-2">Title</th>
                <th className="text-left p-2">Links</th>
                <th className="text-left p-2"></th>
              </tr>
            </thead>
            <tbody>
              {conferencesForSelectedYear.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-2 text-center text-gray-500 dark:text-gray-400">
                    No press conferences for {selectedYear}.
                  </td>
                </tr>
              )}
              {conferencesForSelectedYear.map((conference) => {
                const isEditing = editingId === conference.id
                return (
                  <tr key={conference.id} className="border-b border-gray-100 dark:border-gray-800">
                    {isEditing ? (
                      <td colSpan={4} className="p-2">
                        <div className="space-y-3">
                          {editError && (
                            <div className="rounded-control bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                              {editError}
                            </div>
                          )}
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <input
                              aria-label="Title"
                              type="text"
                              value={editForm.title}
                              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                              className={inputClasses}
                            />
                            <div className="grid grid-cols-2 gap-3">
                              <input
                                aria-label="Season Year"
                                type="number"
                                value={editForm.seasonYear}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, seasonYear: parseInt(e.target.value) })
                                }
                                className={inputClasses}
                              />
                              <input
                                aria-label="Week Number"
                                type="number"
                                value={editForm.weekNumber}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, weekNumber: parseInt(e.target.value) })
                                }
                                className={inputClasses}
                              />
                            </div>
                          </div>
                          <textarea
                            aria-label="Description"
                            value={editForm.description}
                            onChange={(e) =>
                              setEditForm({ ...editForm, description: e.target.value })
                            }
                            rows={2}
                            className={inputClasses}
                          />
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <input
                              aria-label="YouTube URL"
                              type="url"
                              value={editForm.youtubeUrl}
                              onChange={(e) =>
                                setEditForm({ ...editForm, youtubeUrl: e.target.value })
                              }
                              className={inputClasses}
                            />
                            <input
                              aria-label="Spotify URL"
                              type="url"
                              value={editForm.spotifyUrl}
                              onChange={(e) =>
                                setEditForm({ ...editForm, spotifyUrl: e.target.value })
                              }
                              className={inputClasses}
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(conference.id)}
                              disabled={savingId === conference.id}
                              className={`rounded-control bg-primary-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-600 disabled:pointer-events-none disabled:opacity-50 ${focusRingClasses}`}
                            >
                              {savingId === conference.id ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className={`rounded-control px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 ${focusRingClasses}`}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="p-2">{conference.week_number}</td>
                        <td className="p-2">{conference.title}</td>
                        <td className="p-2 text-sm">
                          {[
                            conference.youtube_url && 'YouTube',
                            conference.spotify_url && 'Spotify',
                          ]
                            .filter(Boolean)
                            .join(' + ')}
                        </td>
                        <td className="p-2">
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => startEditing(conference)}
                              className={`rounded text-sm font-medium text-primary-500 hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300 ${focusRingClasses}`}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(conference)}
                              disabled={deletingId === conference.id}
                              className={`rounded text-sm font-medium text-red-500 hover:text-red-600 dark:hover:text-red-400 disabled:pointer-events-none disabled:opacity-50 ${focusRingClasses}`}
                            >
                              {deletingId === conference.id ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                        </td>
                      </>
                    )}
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
