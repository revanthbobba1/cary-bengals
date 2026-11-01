'use client'

import { useState } from 'react'
import { getDisplayName } from '@/lib/displayName'
import { focusRingClasses } from '@/lib/focusRing'
import type { SubmissionStatus } from '@/lib/types/poll'

interface Props {
  rows: SubmissionStatus[]
  teamCount: number | null
  // user_id -> team names in rank order. Only ever passed from the commissioner page.
  ballotsByUser: Record<string, string[]>
  // True when the ballot or team-name query failed, so there are no rankings to show.
  ballotsError: boolean
}

export default function SubmissionStatusList({
  rows,
  teamCount,
  ballotsByUser,
  ballotsError,
}: Props) {
  const [showBallots, setShowBallots] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setShowBallots((v) => !v)}
        aria-pressed={showBallots}
        className={`mb-4 rounded-full border border-gray-300 px-4 py-1.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 ${focusRingClasses}`}
      >
        {showBallots ? 'Hide rankings' : 'Show rankings'}
      </button>
      {showBallots && ballotsError && (
        <p className="mb-2 text-sm text-red-600 dark:text-red-400">
          Couldn't load rankings right now — try refreshing the page.
        </p>
      )}
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {rows.map((row) => {
          const ballot = ballotsByUser[row.user_id]
          return (
            <li key={row.user_id} className="py-2 text-sm">
              <div className="flex items-center justify-between">
                <span>{getDisplayName(row.full_name, row.email, 'Unknown member')}</span>
                {row.has_submitted ? (
                  <span className="text-green-600 dark:text-green-400">✓ Submitted</span>
                ) : row.submission_count > 0 && teamCount !== null ? (
                  <span className="text-yellow-600 dark:text-yellow-400">
                    Needs update ({row.submission_count}/{teamCount})
                  </span>
                ) : (
                  <span className="text-gray-400">Not submitted</span>
                )}
              </div>
              {showBallots && ballot && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {ballot.map((name, i) => `${i + 1}. ${name}`).join(' · ')}
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
