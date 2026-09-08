import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ArticleMatchup } from '@/lib/types/article'

function teamLabel(name: string, record: string | null) {
  return record ? `${name} (${record})` : name
}

export default function MatchupSection({ matchup }: { matchup: ArticleMatchup }) {
  const hasScore = matchup.away_score !== null && matchup.home_score !== null

  return (
    <section className="py-6">
      {matchup.slot_label && (
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {matchup.slot_label}
        </h2>
      )}
      <h3 className="mt-1 text-xl font-bold text-ink dark:text-gray-100">
        {teamLabel(matchup.away_team_name, matchup.away_record)} @{' '}
        {teamLabel(matchup.home_team_name, matchup.home_record)}
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
