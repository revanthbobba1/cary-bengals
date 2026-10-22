import { compareBench, compareStarters } from '@/lib/espn/lineupSort'
import type { MatchupPlayerScore } from '@/lib/types/matchup'

interface Props {
  homeName: string
  awayName: string
  home: MatchupPlayerScore[] | null
  away: MatchupPlayerScore[] | null
}

function PlayerList({ players }: { players: MatchupPlayerScore[] }) {
  const starters = players.filter((p) => p.is_starter).sort(compareStarters)
  const bench = players.filter((p) => !p.is_starter).sort(compareBench)

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
                  <span className="font-mono tabular-nums">{p.points.toFixed(1)}</span>
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
                  {p.lineup_slot === 'IR' && (
                    <span className="rounded-full border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
                      IR
                    </span>
                  )}
                  <span className="font-mono tabular-nums">{p.points.toFixed(1)}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

export default function MatchupBoxScore({ homeName, awayName, home, away }: Props) {
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
