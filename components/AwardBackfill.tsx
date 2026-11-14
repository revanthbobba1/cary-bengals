'use client'

import { useState } from 'react'
import { useToast } from '@/lib/hooks/useToast'
import { focusRingClasses } from '@/lib/focusRing'
import { backfillAwardResultsAction } from 'app/admin/commissioner/award-backfill-actions'

interface Props {
  // Completed past seasons to backfill, oldest first.
  seasons: number[]
}

const buttonClasses = `rounded-full border border-gray-300 px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800 ${focusRingClasses} disabled:pointer-events-none disabled:opacity-50`

export default function AwardBackfill({ seasons }: Props) {
  const toast = useToast()
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)

  const handleBackfill = async () => {
    setRunning(true)
    let totalWeeks = 0
    // Sequential, one season per request: each season is ~30 small reads, and a single call for
    // every season could outlast a serverless function's time limit.
    for (const season of seasons) {
      setProgress(`Computing ${season}…`)
      const response = await backfillAwardResultsAction(season)
      if (response.data === null) {
        toast.error(`${season}: ${response.error}`)
        setRunning(false)
        setProgress(null)
        return
      }
      totalWeeks += response.data.weeksStored
    }
    setRunning(false)
    setProgress(null)
    toast.success(
      totalWeeks > 0
        ? `Stored awards for ${totalWeeks} past week${totalWeeks === 1 ? '' : 's'}.`
        : 'Already up to date — no new weeks to store.'
    )
  }

  return (
    <div className="rounded-card border border-gray-200 bg-white p-6 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-ink dark:text-gray-100">
            Backfill Weekly Awards
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Works out past-season award winners ({seasons[0]}–{seasons[seasons.length - 1]}) for the
            owner trophy cases. Safe to re-run — weeks already stored are skipped. The current
            season updates on its own with every ESPN refresh.
          </p>
          {progress && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400" role="status">
              {progress}
            </p>
          )}
        </div>
        <button type="button" onClick={handleBackfill} disabled={running} className={buttonClasses}>
          {running ? 'Working…' : 'Backfill Awards'}
        </button>
      </div>
    </div>
  )
}
