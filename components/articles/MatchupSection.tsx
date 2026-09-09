import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { matchupWinner } from '@/lib/types/article'
import type { ArticleKind, ArticleMatchup } from '@/lib/types/article'

function teamLabel(name: string, record: string | null) {
  return record ? `${name} (${record})` : name
}

export default function MatchupSection({
  matchup,
  articleKind,
}: {
  matchup: ArticleMatchup
  articleKind: ArticleKind
}) {
  const hasScore = matchup.away_score !== null && matchup.home_score !== null
  const winner = articleKind === 'recap' ? matchupWinner(matchup) : null

  return (
    <section id={`matchup-${matchup.position}`} className="scroll-mt-28 py-6">
      {matchup.slot_label && (
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {matchup.slot_label}
        </h2>
      )}
      <h3 className="mt-1 text-xl font-bold text-ink dark:text-gray-100">
        <span className={winner === 'away' ? 'text-green-600 dark:text-green-400' : undefined}>
          {teamLabel(matchup.away_team_name, matchup.away_record)}
        </span>{' '}
        @{' '}
        <span className={winner === 'home' ? 'text-green-600 dark:text-green-400' : undefined}>
          {teamLabel(matchup.home_team_name, matchup.home_record)}
        </span>
      </h3>
      {matchup.line && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Line: {matchup.line}</p>
      )}
      {hasScore && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Final: {matchup.away_team_name} {matchup.away_score} &ndash; {matchup.home_team_name}{' '}
          {matchup.home_score}
        </p>
      )}
      <div className="prose max-w-none pt-3 dark:prose-invert">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{matchup.body}</ReactMarkdown>
      </div>
    </section>
  )
}
