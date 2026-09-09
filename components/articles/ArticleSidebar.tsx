import Image from '@/components/Image'
import Link from '@/components/Link'
import { getBlurProps } from '@/lib/blurPlaceholders'
import { focusRingClasses } from '@/lib/focusRing'
import type { ArticleMatchup } from '@/lib/types/article'
import type { PollTopFiveRow } from '@/lib/supabase/polls'

interface AuthorInfo {
  name: string
  avatar?: string
  twitter?: string
}

interface Props {
  matchups: ArticleMatchup[]
  author: AuthorInfo | null
  pollTopFive: PollTopFiveRow[]
}

function matchupLabel(m: ArticleMatchup): string {
  return `${m.away_team_name} @ ${m.home_team_name}`
}

export default function ArticleSidebar({ matchups, author, pollTopFive }: Props) {
  return (
    <aside className="sticky top-28 flex flex-col gap-5">
      {author && (
        <div className="flex items-center gap-2">
          {author.avatar && (
            <Image
              src={author.avatar}
              width={38}
              height={38}
              alt={author.name}
              className="h-10 w-10 rounded-full object-cover"
              {...getBlurProps(author.avatar)}
            />
          )}
          <div className="text-sm font-medium leading-5">
            <div className="text-ink dark:text-gray-100">{author.name}</div>
            {author.twitter && (
              <Link
                href={author.twitter}
                className={`rounded text-primary-500 hover:text-primary-600 ${focusRingClasses} dark:hover:text-primary-400`}
              >
                {author.twitter.replace('https://twitter.com/', '@')}
              </Link>
            )}
          </div>
        </div>
      )}

      {matchups.length > 0 && (
        <div className="rounded-card border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            On This Page
          </p>
          <nav className="flex flex-col">
            {matchups.map((matchup) => (
              <a
                key={matchup.id}
                href={`#matchup-${matchup.position}`}
                className={`-ml-3 truncate border-l-2 border-transparent py-1.5 pl-3 text-sm font-medium text-gray-600 transition-colors duration-150 ease-out-expo hover:border-primary-500 hover:text-primary-500 dark:text-gray-400 dark:hover:text-primary-400`}
              >
                {matchupLabel(matchup)}
              </a>
            ))}
          </nav>
        </div>
      )}

      {pollTopFive.length > 0 && (
        <div className="rounded-card border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            This Week in the Poll
          </p>
          <ul>
            {pollTopFive.map((row) => (
              <li
                key={row.team_id}
                className="flex items-center gap-2.5 border-t border-gray-100 py-2 text-sm first:border-none dark:border-gray-800"
              >
                <span className="w-4 flex-none font-bold text-gray-300 dark:text-gray-600">
                  {row.final_rank}
                </span>
                <span className="flex-1 truncate font-semibold text-gray-700 dark:text-gray-300">
                  {row.team_name}
                </span>
              </li>
            ))}
          </ul>
          <Link
            href="/poll"
            className={`mt-3 inline-flex items-center rounded text-xs font-semibold text-primary-500 hover:text-primary-600 ${focusRingClasses} dark:hover:text-primary-400`}
          >
            See full poll results &rarr;
          </Link>
        </div>
      )}
    </aside>
  )
}
