'use client'

import { useEffect, useState } from 'react'
import { Reorder, useDragControls, useReducedMotion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Team, PollWeek, PollSubmission } from '@/lib/types/poll'
import { springSnappy } from '@/lib/motion'
import { useToast } from '@/lib/hooks/useToast'

interface Props {
  pollWeek: PollWeek
  teams: Team[]
  teamRecords: Record<string, { record: string | null; prevRank: number }>
  existingSubmission: Partial<PollSubmission>[]
}

export default function PollSubmissionForm({
  pollWeek,
  teams,
  teamRecords,
  existingSubmission,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const toast = useToast()

  // Initialize rankings from existing submission (in saved order), then append
  // any team not yet ranked (covers partial submissions and teams added after
  // the member last submitted) so all teams always render, never just a subset.
  // Teams with no existing submission start pre-ordered by last week's finalized
  // rank, since most members' ballots resemble the prior week -- a team with no
  // previous rank (bye week, mid-season addition) falls to the end, alphabetical
  // among themselves (the `teams` prop already arrives sorted by name, and
  // Array.prototype.sort is stable, so that order survives the tie).
  const [rankings, setRankings] = useState(() => {
    const ranked = existingSubmission
      .slice()
      .sort((a, b) => (a.rank || 0) - (b.rank || 0))
      .map((sub) => teams.find((t) => t.id === sub.team_id))
      .filter((t): t is Team => Boolean(t))

    const rankedIds = new Set(ranked.map((t) => t.id))
    const unranked = teams
      .filter((t) => !rankedIds.has(t.id))
      .sort((a, b) => {
        const aPrev = teamRecords[a.id]?.prevRank
        const bPrev = teamRecords[b.id]?.prevRank
        if (aPrev == null && bPrev == null) return 0
        if (aPrev == null) return 1
        if (bPrev == null) return -1
        return aPrev - bPrev
      })

    return [...ranked, ...unranked].map((team, idx) => ({
      team_id: team.id,
      team_name: team.name,
      rank: idx + 1,
    }))
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Plain CSS :hover fires on whatever's under the cursor, including sibling rows/buttons
  // dragged over mid-reorder — this suppresses their hover styles while any row is dragging,
  // so only the actively-dragged tile's whileDrag animation is visible. Set from the drag
  // handle's onPointerDown rather than Reorder.Item's onDragStart/onDragEnd: those don't fire
  // reliably when the drag is initiated externally via dragControls.start() (the handle
  // pattern used here), so a window pointerup/pointercancel listener closes it out instead.
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (!isDragging) return
    const stopDragging = () => setIsDragging(false)
    window.addEventListener('pointerup', stopDragging)
    window.addEventListener('pointercancel', stopDragging)
    return () => {
      window.removeEventListener('pointerup', stopDragging)
      window.removeEventListener('pointercancel', stopDragging)
    }
  }, [isDragging])

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
      // Delete-then-insert as a single transaction (submit_poll_ballot, 020),
      // rather than two separate client round-trips — an insert failure for
      // any reason (bad data, a dropped connection, a constraint violation)
      // used to leave the member with no ballot at all, since the prior one
      // was already deleted by the time the insert failed.
      const { error: submitError } = await supabase.rpc('submit_poll_ballot', {
        p_poll_week_id: pollWeek.id,
        p_rankings: rankings.map((r) => ({
          team_id: r.team_id,
          rank: r.rank,
          team_record: teamRecords[r.team_id]?.record || null,
        })),
      })

      if (submitError) throw submitError

      toast.success(existingSubmission.length > 0 ? 'Rankings updated.' : 'Rankings submitted.')
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
        <div className="rounded-control bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <p className="text-sm text-gray-500 dark:text-gray-400">
        Drag teams by the handle to reorder, or use the arrow buttons.
      </p>

      {/* select-none: without it, dragging the pointer over sibling rows' text triggers the
          browser's native text-selection highlight (a click-drag over text always does this
          unless suppressed) — visually indistinguishable from an unwanted hover effect. */}
      <Reorder.Group
        axis="y"
        values={rankings}
        onReorder={handleReorder}
        className="space-y-2 select-none"
      >
        {rankings.map((ranking, index) => (
          <RankingRow
            key={ranking.team_id}
            ranking={ranking}
            index={index}
            isLast={index === rankings.length - 1}
            teamData={teamRecords[ranking.team_id]}
            onMove={moveItem}
            isDragging={isDragging}
            onDragHandleDown={() => setIsDragging(true)}
          />
        ))}
      </Reorder.Group>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_6px_16px_-4px_rgba(249,115,22,0.4)] transition-all duration-150 ease-out-expo hover:-translate-y-px hover:bg-primary-600 hover:shadow-[0_8px_20px_-4px_rgba(249,115,22,0.5)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
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

  // submit_poll_ballot (020, message text updated in 022) runs SECURITY
  // DEFINER, so RLS never denies this call directly — a closed/locked week
  // instead surfaces via its own RAISE EXCEPTION message, which is already
  // the actionable, user-facing text to show as-is.
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
  isDragging: boolean
  onDragHandleDown: () => void
}

function RankingRow({
  ranking,
  index,
  isLast,
  teamData,
  onMove,
  isDragging,
  onDragHandleDown,
}: RankingRowProps) {
  const dragControls = useDragControls()
  const reduceMotion = useReducedMotion()
  const interactiveHover = isDragging
    ? ''
    : 'hover:bg-gray-100 hover:text-ink dark:hover:bg-gray-800 dark:hover:text-gray-100'

  return (
    <Reorder.Item
      value={ranking}
      dragListener={false}
      dragControls={dragControls}
      whileDrag={{
        scale: 1.03,
        boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.25), 0 8px 10px -6px rgb(0 0 0 / 0.15)',
        zIndex: 1,
        transition: springSnappy,
      }}
      transition={reduceMotion ? { duration: 0 } : springSnappy}
      className={`flex items-center gap-3 rounded-card border border-gray-200 bg-white p-3 shadow-card
        transition-shadow duration-150 ease-out-expo
        dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark ${isDragging ? '' : 'hover:shadow-raised dark:hover:shadow-raised-dark'}`}
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
          className={`flex h-9 w-9 items-center justify-center rounded-control text-gray-400
            transition-all duration-150 ease-out-expo active:scale-90 focus-visible:outline
            focus-visible:outline-2 focus-visible:outline-accent-500 focus-visible:outline-offset-2
            disabled:pointer-events-none disabled:opacity-25 ${interactiveHover}`}
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
          className={`flex h-9 w-9 items-center justify-center rounded-control text-gray-400
            transition-all duration-150 ease-out-expo active:scale-90 focus-visible:outline
            focus-visible:outline-2 focus-visible:outline-accent-500 focus-visible:outline-offset-2
            disabled:pointer-events-none disabled:opacity-25 ${interactiveHover}`}
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
        onPointerDown={(e) => {
          onDragHandleDown()
          dragControls.start(e)
        }}
        className={`flex flex-shrink-0 cursor-grab touch-none items-center justify-center
          rounded-control p-2 text-gray-400 transition-colors duration-150 ease-out-expo active:cursor-grabbing ${interactiveHover}`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
          <path d="M7 4a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm0 6a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm0 6a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm6-12a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm0 6a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm0 6a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z" />
        </svg>
      </div>
    </Reorder.Item>
  )
}
