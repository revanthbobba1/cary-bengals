import { genPageMetadata } from 'app/seo'
import siteMetadata from '@/data/siteMetadata'
import { loadScheduleData } from '@/lib/espn/scheduleData'
import MatchupList from '@/components/MatchupList'

export const metadata = genPageMetadata({ title: 'Scoreboard' })

// Rendered on every request, like /league-members and /articles: scores change from a commissioner
// refresh or a scheduled sync, and a prerendered copy stayed stale on Netlify even after
// revalidatePath() ran (see docs/NETLIFY_DEPLOYMENT.md, "Page Caching and Freshness"). Live scores
// during a game are the one place in this app where staleness would be most visible.
export const dynamic = 'force-dynamic'

export default async function Page() {
  const { currentWeek, teamNameById, matchups } = await loadScheduleData(siteMetadata.currentSeason)
  const currentWeekMatchups =
    currentWeek === null ? [] : matchups.filter((matchup) => matchup.week_number === currentWeek)

  return (
    <div className="container py-12">
      <div className="space-y-2 pb-8 md:space-y-5">
        <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-ink dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
          Scoreboard
        </h1>
        {currentWeek !== null && (
          <p className="text-gray-600 dark:text-gray-400">Week {currentWeek}</p>
        )}
      </div>
      {currentWeek === null ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          No matchups synced yet — a commissioner needs to run an ESPN refresh first.
        </p>
      ) : (
        <MatchupList matchups={currentWeekMatchups} teamNameById={teamNameById} />
      )}
    </div>
  )
}
