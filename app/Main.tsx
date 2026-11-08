import { formatDate } from 'pliny/utils/formatDate'
import Link from '@/components/Link'
import TeamLogo from '@/components/TeamLogo'
import siteMetadata from '@/data/siteMetadata'
import { focusRingClasses } from '@/lib/focusRing'
import { getYoutubeThumbnailUrl, getYoutubeVideoId } from '@/lib/youtube'
import type { HomeSnapshot, SnapshotMatchup, StandingsRow, TopScore } from '@/lib/home/homeData'

const cardClasses =
  'rounded-card border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark'

const arrowLinkClasses = `group inline-flex items-center rounded text-sm font-medium text-primary-500 transition-colors duration-150 ease-out-expo hover:text-primary-600 ${focusRingClasses} dark:hover:text-primary-400`

function Section({
  title,
  href,
  linkLabel,
  children,
  className = '',
}: {
  title: string
  href?: string
  linkLabel?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`${cardClasses} flex flex-col ${className}`}>
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-bold tracking-tight text-ink dark:text-gray-100">{title}</h2>
        {href && (
          <Link href={href} className={arrowLinkClasses} aria-label={linkLabel}>
            View all
            <span className="ml-1 inline-block transition-transform duration-200 ease-out-expo group-hover:translate-x-1">
              &rarr;
            </span>
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

function Empty({ children }: { children: string }) {
  return <p className="text-sm text-gray-500 dark:text-gray-400">{children}</p>
}

function TeamLine({
  name,
  logo,
  score,
  projected,
}: {
  name: string
  logo: string | null
  score: number | null
  projected: number | null
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5 text-sm">
      <span className="flex min-w-0 items-center gap-2">
        <TeamLogo src={logo} />
        <span className="truncate font-medium text-ink dark:text-gray-100">{name}</span>
      </span>
      <span className="flex items-baseline gap-2 tabular-nums">
        {projected !== null && (
          <span className="text-xs text-gray-400 dark:text-gray-500">proj {projected}</span>
        )}
        {score !== null && (
          <span className="font-semibold text-ink dark:text-gray-100">{score}</span>
        )}
      </span>
    </div>
  )
}

function MatchupRow({ matchup }: { matchup: SnapshotMatchup }) {
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <TeamLine
        name={matchup.homeName}
        logo={matchup.homeLogo}
        score={matchup.homeScore}
        projected={matchup.homeProjected}
      />
      {matchup.isBye || matchup.awayName === null ? (
        <p className="py-0.5 text-xs text-gray-400 dark:text-gray-500">Bye</p>
      ) : (
        <TeamLine
          name={matchup.awayName}
          logo={matchup.awayLogo}
          score={matchup.awayScore}
          projected={matchup.awayProjected}
        />
      )}
    </li>
  )
}

function ScoreLine({ emoji, label, line }: { emoji: string; label: string; line: TopScore }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-sm text-gray-500 dark:text-gray-400">
      <span aria-hidden="true">{emoji}</span>
      <span>
        Week {line.weekNumber} {label}:
      </span>
      <TeamLogo src={line.teamLogo} />
      <span className="font-medium text-ink dark:text-gray-100">{line.teamName}</span>
      <span className="font-semibold tabular-nums text-ink dark:text-gray-100">{line.score}</span>
      <span>
        ({line.won ? 'beat' : 'lost to'} {line.opponentName} {line.opponentScore})
      </span>
    </p>
  )
}

// Fixed height so the standings rows (two lines of text) and the poll rows beside them (one line)
// stay level with each other.
const listRowClasses = 'flex h-11 items-center'

const badgeLabels = {
  'clinched-bye': { text: 'Bye', title: 'Clinched a first-round bye' },
  clinched: { text: 'In', title: 'Clinched a playoff spot' },
  eliminated: { text: 'Out', title: 'Eliminated from playoff contention' },
} as const

function PlayoffBadge({ status }: { status: NonNullable<StandingsRow['odds']>['status'] }) {
  if (status === 'alive') return null
  const { text, title } = badgeLabels[status]
  const color =
    status === 'eliminated'
      ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
      : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${color}`}
      title={title}
    >
      {text}
    </span>
  )
}

// "Playoffs 72% · Bye 18% · Last 0%"; a decided status drops the figures it already answers.
function oddsSubtext(odds: NonNullable<StandingsRow['odds']>) {
  const parts: string[] = []
  if (odds.status === 'alive') parts.push(`Playoffs ${odds.playoffPct}%`)
  if (odds.status === 'alive' || odds.status === 'clinched') parts.push(`Bye ${odds.byePct}%`)
  if (odds.status === 'alive' || odds.status === 'eliminated') parts.push(`Last ${odds.lastPct}%`)
  return parts.join(' · ')
}

function StandingsList({ rows }: { rows: StandingsRow[] }) {
  return (
    <ol className="divide-y divide-gray-100 dark:divide-gray-800">
      {rows.map((team, index) => (
        <li key={team.id} className={`${listRowClasses} gap-3 text-sm`}>
          <span className="w-5 text-right tabular-nums text-gray-400 dark:text-gray-500">
            {index + 1}
          </span>
          <TeamLogo src={team.logo} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-ink dark:text-gray-100">
              {team.name}
            </span>
            {team.odds && oddsSubtext(team.odds) && (
              <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                {oddsSubtext(team.odds)}
              </span>
            )}
          </span>
          {team.odds && <PlayoffBadge status={team.odds.status} />}
          {team.streak && (
            <span
              className={`text-xs font-semibold tabular-nums ${
                team.streak.kind === 'W'
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
              title={`${team.streak.length} ${team.streak.kind === 'W' ? 'wins' : 'losses'} in a row`}
            >
              {team.streak.kind}
              {team.streak.length}
            </span>
          )}
          <span className="tabular-nums text-gray-500 dark:text-gray-400">
            {team.wins}-{team.losses}
            {team.ties > 0 ? `-${team.ties}` : ''}
          </span>
        </li>
      ))}
    </ol>
  )
}

export default function Home({ snapshot }: { snapshot: HomeSnapshot }) {
  const {
    latestArticle,
    recentArticles,
    latestConference,
    latestPoll,
    latestTransactions,
    standings,
    week,
    matchups,
    topScore,
    lowScore,
  } = snapshot
  const videoId = getYoutubeVideoId(latestConference?.youtube_url)
  const conferenceImage =
    latestConference?.thumbnail_url || (videoId ? getYoutubeThumbnailUrl(videoId) : null)

  return (
    <>
      <div className="space-y-2 pb-8 pt-6 md:space-y-5">
        <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-ink dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
          Cary Bengals
        </h1>
        <p className="text-lg leading-7 text-gray-500 dark:text-gray-400">
          {siteMetadata.description}
        </p>
      </div>

      {/* 6 columns so the bottom row can be two equal halves (standings | poll). */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-6">
        <Section
          title="Latest Article"
          href="/articles"
          linkLabel="View all articles"
          className="lg:col-span-4"
        >
          {latestArticle ? (
            <>
              <Link
                href={`/articles/${latestArticle.slug}`}
                className={`group block rounded ${focusRingClasses}`}
              >
                {latestArticle.published_at && (
                  <time
                    dateTime={latestArticle.published_at}
                    className="text-sm text-gray-500 dark:text-gray-400"
                  >
                    {formatDate(latestArticle.published_at, siteMetadata.locale)}
                  </time>
                )}
                <h3 className="mt-1 text-2xl font-bold leading-8 tracking-tight text-ink transition-colors duration-150 ease-out-expo group-hover:text-primary-500 dark:text-gray-100 dark:group-hover:text-primary-400">
                  {latestArticle.title}
                </h3>
                {latestArticle.summary && (
                  <p className="mt-2 text-gray-500 dark:text-gray-400">{latestArticle.summary}</p>
                )}
              </Link>
              {recentArticles.length > 0 && (
                <ul className="mt-5 divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800">
                  {recentArticles.map((article) => (
                    <li key={article.id}>
                      <Link
                        href={`/articles/${article.slug}`}
                        className={`group -mx-2 flex items-baseline justify-between gap-4 rounded px-2 py-2.5 text-sm transition-colors duration-150 ease-out-expo hover:bg-gray-50 ${focusRingClasses} dark:hover:bg-gray-800/60`}
                      >
                        <span className="truncate font-medium text-ink transition-colors duration-150 ease-out-expo group-hover:text-primary-500 dark:text-gray-100 dark:group-hover:text-primary-400">
                          {article.title}
                        </span>
                        {article.published_at && (
                          <time
                            dateTime={article.published_at}
                            className="shrink-0 text-gray-400 dark:text-gray-500"
                          >
                            {formatDate(article.published_at, siteMetadata.locale)}
                          </time>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <Empty>No articles published yet.</Empty>
          )}
        </Section>

        <Section
          title="Press Conference"
          href="/conferences"
          linkLabel="View all press conferences"
          className="lg:col-span-2"
        >
          {latestConference ? (
            <Link href="/conferences" className={`group block rounded ${focusRingClasses}`}>
              {conferenceImage && (
                // Remote YouTube/ESPN-style thumbnails: a plain <img> avoids next/image domain
                // allowlisting for a purely decorative preview.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={conferenceImage}
                  alt=""
                  className="mb-3 aspect-video w-full rounded-control object-cover"
                />
              )}
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {latestConference.season_year} · Week {latestConference.week_number}
              </p>
              <h3 className="mt-1 font-bold leading-6 text-ink transition-colors duration-150 ease-out-expo group-hover:text-primary-500 dark:text-gray-100 dark:group-hover:text-primary-400">
                {latestConference.title}
              </h3>
            </Link>
          ) : (
            <Empty>No press conferences yet.</Empty>
          )}
        </Section>

        <Section
          title={week ? `Week ${week} Matchups` : 'Matchups'}
          href="/schedule"
          linkLabel="View full schedule"
          className="lg:col-span-4"
        >
          {matchups.length > 0 ? (
            <ul className="grid grid-cols-1 gap-x-8 divide-y divide-gray-100 dark:divide-gray-800 md:grid-cols-2 md:divide-y-0 md:gap-y-4">
              {matchups.map((matchup) => (
                <MatchupRow key={matchup.id} matchup={matchup} />
              ))}
            </ul>
          ) : (
            <Empty>No matchups synced for this week yet.</Empty>
          )}
          {(topScore || lowScore) && (
            <div className="mt-4 space-y-1.5 border-t border-gray-100 pt-3 dark:border-gray-800">
              {topScore && <ScoreLine emoji="🔥" label="high score" line={topScore} />}
              {lowScore && <ScoreLine emoji="🚽" label="low score" line={lowScore} />}
            </div>
          )}
        </Section>

        <Section
          title="Latest Transactions"
          href="/transactions"
          linkLabel="View all transactions"
          className="lg:col-span-2"
        >
          {latestTransactions.length > 0 ? (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {latestTransactions.map((txn) => (
                <li key={txn.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2 text-sm">
                    <TeamLogo src={txn.teamLogo} />
                    <span className="min-w-0 flex-1 truncate font-medium text-ink dark:text-gray-100">
                      {txn.teamName}
                    </span>
                    <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
                      Wk {txn.weekNumber}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{txn.summary}</p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No transactions yet this season.</Empty>
          )}
        </Section>

        {/* Standings has no page of its own, so no "View all" link; it sits beside the poll. */}
        <Section title="Standings" className="lg:col-span-3">
          {standings.length > 0 ? (
            <StandingsList rows={standings} />
          ) : (
            <Empty>Standings will appear once the season is synced.</Empty>
          )}
        </Section>

        <Section
          title={
            latestPoll
              ? `Commissioner’s Poll · Week ${latestPoll.weekNumber}`
              : 'Commissioner’s Poll'
          }
          href="/poll"
          linkLabel="View the commissioner's poll"
          className="lg:col-span-3"
        >
          {latestPoll && latestPoll.rows.length > 0 ? (
            // Same row metrics as the standings list beside it, so the two cards line up.
            <ol className="divide-y divide-gray-100 dark:divide-gray-800">
              {latestPoll.rows.map((row) => (
                <li key={row.team_id} className={`${listRowClasses} gap-3 text-sm`}>
                  <span className="w-5 text-right font-bold tabular-nums text-primary-500">
                    {row.final_rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-ink dark:text-gray-100">
                    {row.team_name}
                  </span>
                  {row.trend !== 0 && (
                    <span
                      className={`shrink-0 text-xs font-semibold tabular-nums ${
                        row.trend > 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {row.trend > 0 ? '↑' : '↓'}
                      {Math.abs(row.trend)}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <Empty>No poll results have been finalized yet.</Empty>
          )}
          {latestPoll && latestPoll.movers.length > 0 && (
            <p className="mt-4 border-t border-gray-100 pt-3 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
              Biggest moves:{' '}
              {latestPoll.movers.map((mover, index) => (
                <span key={mover.team_name}>
                  {index > 0 && ', '}
                  <span className="font-medium text-ink dark:text-gray-100">
                    {mover.team_name}
                  </span>{' '}
                  <span
                    className={`font-semibold tabular-nums ${
                      mover.delta > 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {mover.delta > 0 ? '↑' : '↓'}
                    {Math.abs(mover.delta)}
                  </span>
                </span>
              ))}
            </p>
          )}
        </Section>
      </div>
    </>
  )
}
