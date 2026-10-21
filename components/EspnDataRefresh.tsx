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
    const { namesUpdated, teamCount, playerCount, warnings } = response.data
    // Names and rosters now refresh independently (Promise.allSettled in the action) -- either
    // one succeeding on its own is real progress and must show as success, not get masked by the
    // other one failing or simply having nothing to update this time.
    if (teamCount > 0 || namesUpdated > 0) {
      const rosterNote =
        teamCount > 0
          ? `${teamCount} team${teamCount === 1 ? '' : 's'} (${playerCount} players)`
          : null
      const nameNote =
        namesUpdated > 0 ? `${namesUpdated} name${namesUpdated === 1 ? '' : 's'}` : null
      const parts = [rosterNote, nameNote].filter(Boolean).join(', ')
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
            Updates team names and rosters together for every team already paired with ESPN (see
            Pair New Teams above for first-time linking). No manual review needed — run this any
            time a manager renames their team or makes a roster move you want reflected on the
            public League Members page.
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
        <div className="mt-4 rounded-control bg-yellow-50 p-4 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
          {result.warnings.join(' ')}
        </div>
      )}
    </div>
  )
}
