import type { Matchup } from '@/lib/types/matchup'

interface Props {
  matchups: Matchup[]
  teamNameById: Map<string, string>
}

// Shared between /scoreboard (current week only) and /schedule (every week) -- same row shape,
// rendered identically in both places; the parent page decides filtering/grouping.
export default function MatchupList({ matchups, teamNameById }: Props) {
  if (matchups.length === 0) {
    return <p className="text-sm text-gray-600 dark:text-gray-400">No matchups yet.</p>
  }

  return (
    <ul className="space-y-2">
      {matchups.map((matchup) => {
        const homeName = teamNameById.get(matchup.home_team_id) ?? 'Unknown team'
        const awayName = teamNameById.get(matchup.away_team_id) ?? 'Unknown team'
        const homeWon = matchup.winner === 'HOME'
        const awayWon = matchup.winner === 'AWAY'

        return (
          <li
            key={matchup.id}
            className="rounded-card border border-gray-200 bg-white px-4 py-3 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark"
          >
            <div className="flex items-center justify-between gap-4">
              <span
                className={`truncate text-sm ${homeWon ? 'font-semibold text-ink dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}
              >
                {homeName}
              </span>
              <span className="shrink-0 font-mono text-sm tabular-nums text-ink dark:text-gray-100">
                {matchup.home_score.toFixed(2)} – {matchup.away_score.toFixed(2)}
              </span>
              <span
                className={`truncate text-right text-sm ${awayWon ? 'font-semibold text-ink dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}
              >
                {awayName}
              </span>
            </div>
            {matchup.winner === 'TIE' && (
              <p className="mt-1 text-center text-xs text-gray-500 dark:text-gray-400">Tie</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
