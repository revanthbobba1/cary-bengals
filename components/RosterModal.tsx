'use client'

import { useEffect, useState } from 'react'
import { focusRingClasses } from '@/lib/focusRing'
import type { RosterPlayer } from '@/lib/types/roster'

interface Props {
  teamName: string
  players: RosterPlayer[]
}

// ESPN's standard starting lineup order, as shown in its own app -- not derivable from the
// payload itself (its own entries array isn't in this order; see backend/app/services/roster.py).
// Slot labels match app/services/roster.py's _LINEUP_SLOTS values exactly.
const STARTER_SLOT_ORDER: Record<string, number> = {
  QB: 0,
  RB: 1,
  'RB/WR': 2,
  WR: 3,
  'WR/TE': 4,
  TE: 5,
  FLEX: 6,
  OP: 7,
  'D/ST': 8,
  K: 9,
}

// Bench has no ESPN-documented display order we could find -- the payload's own array order
// doesn't match what ESPN's app shows either. Grouping by position (then IR last, since that's
// a distinct status players are pulled out for) is the closest reasonable approximation.
const BENCH_POSITION_ORDER: Record<string, number> = {
  QB: 0,
  RB: 1,
  WR: 2,
  TE: 3,
  'D/ST': 4,
  K: 5,
}

function compareStarters(a: RosterPlayer, b: RosterPlayer): number {
  const slotDiff =
    (STARTER_SLOT_ORDER[a.lineup_slot] ?? 99) - (STARTER_SLOT_ORDER[b.lineup_slot] ?? 99)
  return slotDiff !== 0 ? slotDiff : a.sort_order - b.sort_order
}

function compareBench(a: RosterPlayer, b: RosterPlayer): number {
  const aIr = a.lineup_slot === 'IR'
  const bIr = b.lineup_slot === 'IR'
  if (aIr !== bIr) return aIr ? 1 : -1
  const posDiff =
    (BENCH_POSITION_ORDER[a.position] ?? 99) - (BENCH_POSITION_ORDER[b.position] ?? 99)
  return posDiff !== 0 ? posDiff : a.sort_order - b.sort_order
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

  const starters = players.filter((p) => p.is_starter).sort(compareStarters)
  const bench = players.filter((p) => !p.is_starter).sort(compareBench)

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
                      <span className="flex items-center gap-1.5 whitespace-nowrap">
                        {p.position} · {p.pro_team}
                        {p.lineup_slot === 'IR' && (
                          <span className="rounded-full border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
                            IR
                          </span>
                        )}
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
