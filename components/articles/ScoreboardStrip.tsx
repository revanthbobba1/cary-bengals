import { matchupWinner } from '@/lib/types/article'
import type { ArticleMatchup, ArticleKind } from '@/lib/types/article'

interface Props {
  matchups: ArticleMatchup[]
  kind: ArticleKind
}

export default function ScoreboardStrip({ matchups, kind }: Props) {
  if (matchups.length === 0) return null

  return (
    <div className="mb-10 flex gap-3 overflow-x-auto pb-2">
      {matchups.map((matchup) => {
        const winner = kind === 'recap' ? matchupWinner(matchup) : null
        return (
          <a
            key={matchup.id}
            href={`#matchup-${matchup.position}`}
            className="flex-none basis-40 rounded-control border border-gray-200 bg-white p-3 shadow-card transition-all duration-150 ease-out-expo hover:-translate-y-0.5 hover:shadow-raised dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark dark:hover:shadow-raised-dark"
          >
            <div className="flex items-baseline justify-between gap-2 py-0.5 text-xs">
              <span
                className={`truncate font-semibold ${winner === 'away' ? 'text-ink dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}
              >
                {matchup.away_team_name}
              </span>
              {matchup.away_score !== null && (
                <span
                  className={`font-semibold tabular-nums ${winner === 'away' ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}
                >
                  {matchup.away_score}
                </span>
              )}
            </div>
            <div className="flex items-baseline justify-between gap-2 py-0.5 text-xs">
              <span
                className={`truncate font-semibold ${winner === 'home' ? 'text-ink dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}
              >
                {matchup.home_team_name}
              </span>
              {matchup.home_score !== null && (
                <span
                  className={`font-semibold tabular-nums ${winner === 'home' ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}
                >
                  {matchup.home_score}
                </span>
              )}
            </div>
            {kind === 'preview' && matchup.line && (
              <div className="mt-1 truncate text-[11px] text-gray-400 dark:text-gray-500">
                {matchup.line}
              </div>
            )}
          </a>
        )
      })}
    </div>
  )
}
