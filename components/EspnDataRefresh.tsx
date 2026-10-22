'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/lib/hooks/useToast'
import { focusRingClasses } from '@/lib/focusRing'
import {
  refreshEspnDataAction,
  type EspnDataRefreshResult,
} from 'app/admin/commissioner/espn-refresh-actions'

interface Props {
  seasonYear: number
}

const primaryButtonClasses = `rounded-full bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_16px_-4px_rgba(249,115,22,0.4)] transition-all duration-150 ease-out-expo hover:-translate-y-px hover:bg-primary-600 hover:shadow-[0_8px_20px_-4px_rgba(249,115,22,0.5)] ${focusRingClasses} active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50`

export default function EspnDataRefresh({ seasonYear }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [refreshing, setRefreshing] = useState(false)
  const [result, setResult] = useState<EspnDataRefreshResult | null>(null)

  const handleRefresh = async () => {
    setRefreshing(true)
    const response = await refreshEspnDataAction(seasonYear)
    setRefreshing(false)

    if (response.data === null) {
      toast.error(response.error)
      return
    }

    setResult(response.data)
    const { namesUpdated, teamCount, playerCount, recordsUpdated, matchupsUpdated, warnings } =
      response.data
    // Names, rosters, records, and matchups now refresh independently (Promise.allSettled in the
    // action) -- any one succeeding on its own is real progress and must show as success, not get
    // masked by another one failing or simply having nothing to update this time.
    if (teamCount > 0 || namesUpdated > 0 || recordsUpdated > 0 || matchupsUpdated > 0) {
      const rosterNote =
        teamCount > 0
          ? `${teamCount} team${teamCount === 1 ? '' : 's'} (${playerCount} players)`
          : null
      const nameNote =
        namesUpdated > 0 ? `${namesUpdated} name${namesUpdated === 1 ? '' : 's'}` : null
      const recordNote =
        recordsUpdated > 0 ? `${recordsUpdated} record${recordsUpdated === 1 ? '' : 's'}` : null
      const matchupNote =
        matchupsUpdated > 0 ? `${matchupsUpdated} matchup${matchupsUpdated === 1 ? '' : 's'}` : null
      const parts = [rosterNote, nameNote, recordNote, matchupNote].filter(Boolean).join(', ')
      const caveat = warnings.length > 0 ? ' — see warnings below.' : '.'
      toast.success(`Refreshed ${parts}${caveat}`)
    } else {
      toast.error(warnings[0] ?? 'Nothing was refreshed.')
    }
    router.refresh()
  }

  return (
    <div className="rounded-card border border-gray-200 bg-white p-6 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-ink dark:text-gray-100">
            Refresh ESPN Data
            <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              Safe to run anytime
            </span>
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Updates team names, rosters, win-loss records, and head-to-head matchup scores together
            for every team already paired with ESPN (see Pair New Teams above for first-time
            linking). No manual review needed — run this any time a manager renames their team,
            makes a roster move, or a game result changes something you want reflected on the public
            League Members or Schedule pages, or the poll.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className={primaryButtonClasses}
        >
          {refreshing ? 'Refreshing...' : 'Refresh ESPN Data'}
        </button>
      </div>

      {result && result.warnings.length > 0 && (
        <ul className="mt-4 space-y-2 rounded-control bg-yellow-50 p-4 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
          {result.warnings.map((warning, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden="true">•</span>
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
