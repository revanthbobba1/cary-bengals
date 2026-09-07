'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/lib/hooks/useToast'
import { focusRingClasses } from '@/lib/focusRing'
import type { ArticleKind } from '@/lib/types/article'

interface LeagueMember {
  id: string
  email: string
  full_name: string | null
}

interface Props {
  members: LeagueMember[]
  defaultSeasonYear: number
}

const inputClasses =
  'w-full rounded-control border border-gray-200 bg-white p-2 text-gray-900 shadow-card transition-shadow duration-150 ease-out-expo focus:border-accent-500 focus:shadow-raised focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:shadow-card-dark'

function memberLabel(member: LeagueMember): string {
  return member.full_name || member.email
}

export default function AssignArticleForm({ members, defaultSeasonYear }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const toast = useToast()

  const [seasonYear, setSeasonYear] = useState(defaultSeasonYear)
  const [weekNumber, setWeekNumber] = useState(1)
  const [kind, setKind] = useState<ArticleKind>('preview')
  const [authorId, setAuthorId] = useState(members[0]?.id ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!authorId) {
      setError('Choose a member to assign this week to.')
      return
    }

    setLoading(true)
    try {
      const { error: rpcError } = await supabase.rpc('assign_article', {
        p_season_year: seasonYear,
        p_week_number: weekNumber,
        p_kind: kind,
        p_author_id: authorId,
      })

      if (rpcError) throw rpcError

      router.refresh()
      setWeekNumber((prev) => prev + 1)
      toast.success(
        `${seasonYear} Week ${weekNumber} ${kind} assigned to ${memberLabel(members.find((m) => m.id === authorId)!)}.`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign article')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={handleAssign}
      className="space-y-4 rounded-card border border-gray-200 bg-white p-6 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark"
    >
      <h2 className="text-xl font-semibold text-ink dark:text-gray-100">Assign a Writeup</h2>

      {error && (
        <div className="rounded-control bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div>
          <label htmlFor="assign-season-year" className="block text-sm font-medium mb-1">
            Season Year
          </label>
          <input
            id="assign-season-year"
            type="number"
            value={seasonYear}
            onChange={(e) => setSeasonYear(parseInt(e.target.value))}
            className={inputClasses}
          />
        </div>

        <div>
          <label htmlFor="assign-week-number" className="block text-sm font-medium mb-1">
            Week Number
          </label>
          <input
            id="assign-week-number"
            type="number"
            value={weekNumber}
            onChange={(e) => setWeekNumber(parseInt(e.target.value))}
            min={1}
            className={inputClasses}
          />
        </div>

        <div>
          <label htmlFor="assign-kind" className="block text-sm font-medium mb-1">
            Kind
          </label>
          <select
            id="assign-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as ArticleKind)}
            className={inputClasses}
          >
            <option value="preview">Preview</option>
            <option value="recap">Recap</option>
          </select>
        </div>

        <div>
          <label htmlFor="assign-author" className="block text-sm font-medium mb-1">
            Assign To
          </label>
          <select
            id="assign-author"
            value={authorId}
            onChange={(e) => setAuthorId(e.target.value)}
            className={inputClasses}
          >
            {members.length === 0 && <option value="">No members found</option>}
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {memberLabel(member)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || members.length === 0}
        className={`rounded-full bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_16px_-4px_rgba(249,115,22,0.4)] transition-all duration-150 ease-out-expo hover:-translate-y-px hover:bg-primary-600 hover:shadow-[0_8px_20px_-4px_rgba(249,115,22,0.5)] ${focusRingClasses} active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50`}
      >
        {loading ? 'Assigning...' : 'Assign Writeup'}
      </button>
    </form>
  )
}
