'use client'

import { useState } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Team, PollWeek, PollSubmission } from '@/lib/types/poll'

interface Props {
  pollWeek: PollWeek
  teams: Team[]
  teamRecords: Record<string, { record: string | null; prevRank: number }>
  existingSubmission: Partial<PollSubmission>[]
  userId: string
}

export default function PollSubmissionForm({
  pollWeek,
  teams,
  teamRecords,
  existingSubmission,
  userId,
}: Props) {
  const router = useRouter()
  const supabase = createClient()

  // Initialize rankings from existing submission (in saved order), then append
  // any team not yet ranked (covers partial submissions and teams added after
  // the member last submitted) so all teams always render, never just a subset.
  const [rankings, setRankings] = useState(() => {
    const ranked = existingSubmission
      .slice()
      .sort((a, b) => (a.rank || 0) - (b.rank || 0))
      .map((sub) => teams.find((t) => t.id === sub.team_id))
      .filter((t): t is Team => Boolean(t))

    const rankedIds = new Set(ranked.map((t) => t.id))
    const unranked = teams.filter((t) => !rankedIds.has(t.id))

    return [...ranked, ...unranked].map((team, idx) => ({
      team_id: team.id,
      team_name: team.name,
      rank: idx + 1,
    }))
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-derive the `rank` field (1-based) from array position after a reorder,
  // whether that reorder came from a drag gesture or a keyboard move.
  const handleReorder = (newOrder: typeof rankings) => {
    setRankings(newOrder.map((r, idx) => ({ ...r, rank: idx + 1 })))
  }

  const moveItem = (teamId: string, direction: -1 | 1) => {
    setRankings((prev) => {
      const fromIndex = prev.findIndex((r) => r.team_id === teamId)
      const toIndex = fromIndex + direction
      if (fromIndex === -1 || toIndex < 0 || toIndex >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next.map((r, idx) => ({ ...r, rank: idx + 1 }))
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Delete existing submissions for this user/week. RLS silently filters
      // rows rather than raising an error, so a closed week produces a
      // *successful* delete of zero rows here, not a thrown error — check the
      // count explicitly rather than relying on deleteError.
      const { data: deletedRows, error: deleteError } = await supabase
        .from('poll_submissions')
        .delete()
        .eq('poll_week_id', pollWeek.id)
        .eq('user_id', userId)
        .select('id')

      if (deleteError) throw deleteError

      if (existingSubmission.length > 0 && (deletedRows?.length || 0) === 0) {
        throw new Error(
          'This week closed while you were ranking. Refresh the page to see the current poll status.'
        )
      }

      // Insert new submissions (with team records from previous week)
      const submissions = rankings.map((r) => ({
        poll_week_id: pollWeek.id,
        user_id: userId,
        team_id: r.team_id,
        rank: r.rank,
        team_record: teamRecords[r.team_id]?.record || null,
      }))

      const { error: insertError } = await supabase.from('poll_submissions').insert(submissions)

      if (insertError) throw insertError

      router.push('/admin')
      router.refresh()
    } catch (err) {
      setError(describeSubmissionError(err))
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <p className="text-sm text-gray-500 dark:text-gray-400">
        Drag teams by the handle to reorder, or use the arrow buttons.
      </p>

      <Reorder.Group axis="y" values={rankings} onReorder={handleReorder} className="space-y-2">
        {rankings.map((ranking, index) => (
          <RankingRow
            key={ranking.team_id}
            ranking={ranking}
            index={index}
            isLast={index === rankings.length - 1}
            teamData={teamRecords[ranking.team_id]}
            onMove={moveItem}
          />
        ))}
      </Reorder.Group>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-primary-500 px-4 py-2 text-white font-medium
          hover:bg-primary-600 disabled:opacity-50"
      >
        {loading
          ? 'Submitting...'
          : existingSubmission.length > 0
            ? 'Update Rankings'
            : 'Submit Rankings'}
      </button>
    </form>
  )
}

function describeSubmissionError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? (err as { code?: string }).code
      : undefined

  if (code === '42501') {
    return 'This week is no longer open for submissions.'
  }
  if (code === '23505') {
    return 'Your rankings could not be saved due to a conflicting submission. Please refresh and try again.'
  }
  if (err instanceof Error) {
    return err.message
  }
  return 'Failed to submit poll rankings.'
}

interface Ranking {
  team_id: string
  team_name: string
  rank: number
}

interface RankingRowProps {
  ranking: Ranking
  index: number
  isLast: boolean
  teamData?: { record: string | null; prevRank: number }
  onMove: (teamId: string, direction: -1 | 1) => void
}

function RankingRow({ ranking, index, isLast, teamData, onMove }: RankingRowProps) {
  const dragControls = useDragControls()

  return (
    <Reorder.Item
      value={ranking}
      dragListener={false}
      dragControls={dragControls}
      whileDrag={{
        scale: 1.03,
        boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.25), 0 8px 10px -6px rgb(0 0 0 / 0.15)',
        zIndex: 1,
      }}
      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
      className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3
        dark:border-gray-700 dark:bg-gray-800"
    >
      {/* Rank badge - animates its number as position changes */}
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full
          bg-primary-500 text-sm font-bold text-white"
      >
        #{index + 1}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{ranking.team_name}</div>
        {teamData && (
          <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {teamData.record && <span>Record: {teamData.record}</span>}
            {teamData.prevRank && <span className="ml-3">Last Week: #{teamData.prevRank}</span>}
          </div>
        )}
      </div>

      {/* Keyboard-accessible reorder fallback, since drag is pointer/touch only */}
      <div className="flex flex-shrink-0 flex-col">
        <button
          type="button"
          onClick={() => onMove(ranking.team_id, -1)}
          disabled={index === 0}
          aria-label={`Move ${ranking.team_name} up`}
          className="flex h-9 w-9 items-center justify-center rounded text-gray-400
            hover:bg-gray-200 hover:text-gray-700 disabled:pointer-events-none
            disabled:opacity-25 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path
              fillRule="evenodd"
              d="M10 3a.75.75 0 01.53.22l4.25 4.25a.75.75 0 01-1.06 1.06L10.75 5.56v10.69a.75.75 0 01-1.5 0V5.56L6.28 8.53a.75.75 0 01-1.06-1.06l4.25-4.25A.75.75 0 0110 3z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onMove(ranking.team_id, 1)}
          disabled={isLast}
          aria-label={`Move ${ranking.team_name} down`}
          className="flex h-9 w-9 items-center justify-center rounded text-gray-400
            hover:bg-gray-200 hover:text-gray-700 disabled:pointer-events-none
            disabled:opacity-25 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path
              fillRule="evenodd"
              d="M10 17a.75.75 0 01-.53-.22l-4.25-4.25a.75.75 0 011.06-1.06l2.97 2.97V3.75a.75.75 0 011.5 0v10.69l2.97-2.97a.75.75 0 111.06 1.06l-4.25 4.25A.75.75 0 0110 17z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {/* Drag handle */}
      <div
        onPointerDown={(e) => dragControls.start(e)}
        className="flex flex-shrink-0 cursor-grab touch-none items-center justify-center
          rounded p-2 text-gray-400 active:cursor-grabbing hover:bg-gray-200
          hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        aria-hidden="true"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
          <path d="M7 4a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm0 6a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm0 6a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm6-12a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm0 6a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm0 6a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z" />
        </svg>
      </div>
    </Reorder.Item>
  )
}
