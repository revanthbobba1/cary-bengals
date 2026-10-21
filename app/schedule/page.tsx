import { genPageMetadata } from 'app/seo'
import siteMetadata from '@/data/siteMetadata'
import { loadScheduleData } from '@/lib/espn/scheduleData'
import MatchupList from '@/components/MatchupList'
import type { Matchup } from '@/lib/types/matchup'

export const metadata = genPageMetadata({ title: 'Schedule' })

// Same force-dynamic reasoning as /scoreboard and /league-members -- see
// docs/NETLIFY_DEPLOYMENT.md, "Page Caching and Freshness".
export const dynamic = 'force-dynamic'

export default async function Page() {
  const { currentWeek, teamNameById, matchups } = await loadScheduleData(siteMetadata.currentSeason)

  const matchupsByWeek = new Map<number, Matchup[]>()
  for (const matchup of matchups) {
    const weekMatchups = matchupsByWeek.get(matchup.week_number) ?? []
    weekMatchups.push(matchup)
    matchupsByWeek.set(matchup.week_number, weekMatchups)
  }
  const weeks = Array.from(matchupsByWeek.keys()).sort((a, b) => a - b)

  return (
    <div className="container py-12">
      <div className="space-y-2 pb-8 md:space-y-5">
        <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-ink dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
          Schedule
        </h1>
      </div>
      {weeks.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          No matchups synced yet — a commissioner needs to run an ESPN refresh first.
        </p>
      ) : (
        <div className="space-y-10">
          {weeks.map((week) => (
            <section key={week}>
              <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold text-ink dark:text-gray-100">
                Week {week}
                {week === currentWeek && (
                  <span className="rounded-full bg-primary-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                    Current
                  </span>
                )}
              </h2>
              <MatchupList matchups={matchupsByWeek.get(week) ?? []} teamNameById={teamNameById} />
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
