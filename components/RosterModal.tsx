'use client'

import { useEffect, useState } from 'react'
import { focusRingClasses } from '@/lib/focusRing'
import type { RosterPlayer } from '@/lib/types/roster'

interface Props {
  teamName: string
  players: RosterPlayer[]
}

export default function RosterModal({ teamName, players }: Props) {
  const [open, setOpen] = useState(false)

  // No existing modal pattern in this app to reuse — kept intentionally minimal (overlay +
  // Escape-to-close) rather than a full focus-trap/accessible-dialog implementation, matching
  // this app's "99% usable, not 99.99%" bar for a secondary, opt-in feature.
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open])

  const starters = players.filter((p) => p.is_starter)
  const bench = players.filter((p) => !p.is_starter)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`mt-1 text-sm font-medium text-primary-500 hover:underline ${focusRingClasses}`}
      >
        View Roster
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close roster"
            className="fixed inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${teamName} roster`}
            className="relative max-h-[80vh] w-full max-w-md overflow-y-auto rounded-card border border-gray-200 bg-white p-6 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark"
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold text-ink dark:text-gray-100">{teamName}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className={`rounded-full p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 ${focusRingClasses}`}
              >
                ✕
              </button>
            </div>

            {starters.length > 0 && (
              <>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Starters
                </h4>
                <ul className="mb-4 space-y-1 text-sm">
                  {starters.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-4">
                      <span className="text-ink dark:text-gray-100">{p.player_name}</span>
                      <span className="whitespace-nowrap text-gray-500 dark:text-gray-400">
                        {p.lineup_slot} · {p.pro_team}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {bench.length > 0 && (
              <>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Bench
                </h4>
                <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                  {bench.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-4">
                      <span>{p.player_name}</span>
                      <span className="whitespace-nowrap">
                        {p.position} · {p.pro_team}
                        {p.lineup_slot === 'IR' ? ' · IR' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
