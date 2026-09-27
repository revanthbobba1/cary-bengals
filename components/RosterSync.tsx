'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/lib/hooks/useToast'
import { focusRingClasses } from '@/lib/focusRing'
import { syncRostersAction } from 'app/admin/commissioner/roster-sync-actions'
import type { RosterSyncResult } from '@/lib/espn/rosterSync'

interface Props {
  seasonYear: number
}

const primaryButtonClasses = `rounded-full bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_16px_-4px_rgba(249,115,22,0.4)] transition-all duration-150 ease-out-expo hover:-translate-y-px hover:bg-primary-600 hover:shadow-[0_8px_20px_-4px_rgba(249,115,22,0.5)] ${focusRingClasses} active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50`

export default function RosterSync({ seasonYear }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<RosterSyncResult | null>(null)

  const handleSync = async () => {
    setSyncing(true)
    const response = await syncRostersAction(seasonYear)
    setSyncing(false)

    if (response.data === null) {
      toast.error(response.error)
      return
    }

    setResult(response.data)
    // teamCount > 0 is real progress even alongside warnings (e.g. one team with no ESPN
    // roster this week) -- only a fully empty sync reads as an actual failure. Warnings, if
    // any, still show in the banner below regardless of which toast fires.
    if (response.data.teamCount > 0) {
      const caveat = response.data.warnings.length > 0 ? ' — see warnings below.' : '.'
      toast.success(
        `Synced rosters for ${response.data.teamCount} teams (${response.data.playerCount} players)${caveat}`
      )
    } else {
      toast.error(response.data.warnings[0] ?? 'No rosters were synced.')
    }
    router.refresh()
  }

  return (
    <div className="rounded-card border border-gray-200 bg-white p-6 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-ink dark:text-gray-100">
            Sync Rosters
            <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              Run after roster moves
            </span>
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Pulls each already-synced team&apos;s current roster from ESPN. No manual pairing needed
            — only teams with an ESPN team ID (see Team Sync above) get a roster. Unlike Team Sync,
            this changes often — re-run it any time there are trades, waivers, or lineup moves you
            want reflected on the public League Members page.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className={primaryButtonClasses}
        >
          {syncing ? 'Syncing...' : 'Sync Rosters'}
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
