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

        // Projected score/win probability are only ever non-null for the current matchup period
        // (see lib/types/matchup.ts) -- so this subline naturally disappears once a week is
        // final and never appears for a future week, with no "is this the current week" check
        // needed here. `!= null` (not `!==`) also tolerates a row read before migration 044 is
        // applied, where these columns are absent (`undefined`) rather than `null`. Both sides
        // are checked, not just home -- nothing in the ESPN schema guarantees they're always
        // both-or-neither populated.
        const hasProjection =
          matchup.home_projected_score != null && matchup.away_projected_score != null

        return (
          <li
            key={matchup.id}
            className="rounded-card border border-gray-200 bg-white px-4 py-3 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p
                  className={`truncate text-sm ${homeWon ? 'font-semibold text-ink dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}
                >
                  {homeName}
                </p>
                {matchup.home_win_probability != null && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {Math.round(matchup.home_win_probability * 100)}% win
                  </p>
                )}
              </div>
              <div className="shrink-0 text-center">
                <p className="font-mono text-sm tabular-nums text-ink dark:text-gray-100">
                  {matchup.home_score.toFixed(2)} – {matchup.away_score.toFixed(2)}
                </p>
                {hasProjection && (
                  <p className="font-mono text-xs tabular-nums text-gray-400 dark:text-gray-500">
                    {/* Non-null: hasProjection already confirmed both sides are non-null above. */}
                    Proj {matchup.home_projected_score!.toFixed(1)} –{' '}
                    {matchup.away_projected_score!.toFixed(1)}
                  </p>
                )}
              </div>
              <div className="min-w-0 text-right">
                <p
                  className={`truncate text-sm ${awayWon ? 'font-semibold text-ink dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}
                >
                  {awayName}
                </p>
                {matchup.away_win_probability != null && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {Math.round(matchup.away_win_probability * 100)}% win
                  </p>
                )}
              </div>
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
