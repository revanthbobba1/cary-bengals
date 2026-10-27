'use client'

import { useMemo } from 'react'
import { compareBench, compareStarters, isOnIR } from '@/lib/espn/lineupSort'
import IRBadge from '@/components/IRBadge'
import { useChangeFlash } from '@/lib/hooks/useChangeFlash'
import type { MatchupPlayerScore } from '@/lib/types/matchup'

interface Props {
  homeName: string
  awayName: string
  // A bye has no away side, ever -- away is permanently null there even though home's box score
  // is real, so that can't be treated as "not synced yet" like it is for a normal matchup.
  isBye?: boolean
  home: MatchupPlayerScore[] | null
  away: MatchupPlayerScore[] | null
}

function PlayerList({ players }: { players: MatchupPlayerScore[] }) {
  const starters = players.filter((p) => p.is_starter).sort(compareStarters)
  const bench = players.filter((p) => !p.is_starter).sort(compareBench)

  // Same live-poll-highlight pattern as MatchupList's team score, scoped to this one side's
  // players -- a refresh that bumps an individual player's points briefly highlights just that
  // player's number, not the whole box score.
  const pointsValues = useMemo(() => {
    const values: Record<string, number> = {}
    for (const p of players) values[p.id] = p.points
    return values
  }, [players])
  const flashingPlayerIds = useChangeFlash(pointsValues)

  const pointsClass = (id: string) =>
    `rounded px-1 font-mono tabular-nums transition-colors duration-1000 ${
      flashingPlayerIds.has(id) ? 'bg-yellow-100 dark:bg-yellow-900/30' : ''
    }`

  return (
    <>
      {starters.length > 0 && (
        <>
          <h5 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Starters
          </h5>
          <ul className="mb-3 space-y-1 text-sm">
            {starters.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4">
                <span className="truncate text-ink dark:text-gray-100">{p.player_name}</span>
                <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-gray-500 dark:text-gray-400">
                  {p.lineup_slot}
                  <span className={pointsClass(p.id)}>{p.points.toFixed(1)}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {bench.length > 0 && (
        <>
          <h5 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Bench
          </h5>
          <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
            {bench.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4">
                <span className="truncate">{p.player_name}</span>
                <span className="flex shrink-0 items-center gap-2 whitespace-nowrap">
                  {p.position}
                  {isOnIR(p.lineup_slot) && <IRBadge />}
                  <span className={pointsClass(p.id)}>{p.points.toFixed(1)}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

export default function MatchupBoxScore({ homeName, awayName, isBye = false, home, away }: Props) {
  if (isBye) {
    if (home === null) {
      return (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          On bye this week. No player breakdown yet.
        </p>
      )
    }
    return (
      <div>
        <h4 className="mb-1 text-sm font-semibold text-ink dark:text-gray-100">{homeName}</h4>
        <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">On bye this week</p>
        <PlayerList players={home} />
      </div>
    )
  }

  if (home === null || away === null) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-400">No player breakdown for this week.</p>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <div>
        <h4 className="mb-2 text-sm font-semibold text-ink dark:text-gray-100">{homeName}</h4>
        <PlayerList players={home} />
      </div>
      <div>
        <h4 className="mb-2 text-sm font-semibold text-ink dark:text-gray-100">{awayName}</h4>
        <PlayerList players={away} />
      </div>
    </div>
  )
}
