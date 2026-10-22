import Link from 'next/link'
import { genPageMetadata } from 'app/seo'
import siteMetadata from '@/data/siteMetadata'
import { loadScheduleData } from '@/lib/espn/scheduleData'
import MatchupList from '@/components/MatchupList'
import type { Matchup } from '@/lib/types/matchup'

export const metadata = genPageMetadata({ title: 'Schedule' })

// Same force-dynamic reasoning as /league-members -- see docs/NETLIFY_DEPLOYMENT.md, "Page
// Caching and Freshness". Reading `searchParams` below would opt this route into dynamic
// rendering on its own anyway (same as /articles), but this is kept explicit since the Supabase
// reads are the actual reason this page must never be cached.
export const dynamic = 'force-dynamic'

export default async function Page({
  searchParams,
}: {
  // A repeated param (`?week=3&week=5`) arrives as an array, so the type can't be just `string`.
  // Same "anything that isn't a single value falls through to the default" handling as
  // /articles' `season` param.
  searchParams: { week?: string | string[] }
}) {
  const { currentWeek, teamNameById, matchups } = await loadScheduleData(siteMetadata.currentSeason)

  const matchupsByWeek = new Map<number, Matchup[]>()
  for (const matchup of matchups) {
    const weekMatchups = matchupsByWeek.get(matchup.week_number) ?? []
    weekMatchups.push(matchup)
    matchupsByWeek.set(matchup.week_number, weekMatchups)
  }
  const weeks = Array.from(matchupsByWeek.keys()).sort((a, b) => a - b)

  const requestedWeek =
    typeof searchParams.week === 'string' ? Number(searchParams.week) : Number.NaN
  const selectedWeek = weeks.includes(requestedWeek)
    ? requestedWeek
    : (currentWeek ?? weeks[weeks.length - 1] ?? null)

  return (
    <div className="container py-12">
      <div className="space-y-2 pb-8 md:space-y-5">
        <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-ink dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
          Schedule
        </h1>
      </div>
      {weeks.length === 0 || selectedWeek === null ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          No matchups synced yet — a commissioner needs to run an ESPN refresh first.
        </p>
      ) : (
        <>
          <nav className="mb-6 flex flex-wrap gap-2" aria-label="Select week">
            {weeks.map((week) => {
              const isSelected = week === selectedWeek
              const isCurrent = week === currentWeek
              return (
                <Link
                  key={week}
                  href={isCurrent ? '/schedule' : `/schedule?week=${week}`}
                  className={`rounded-full px-3 py-1 text-sm font-medium ${
                    isSelected
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                  } ${isCurrent && !isSelected ? 'ring-2 ring-inset ring-primary-500' : ''}`}
                >
                  {week}
                </Link>
              )
            })}
          </nav>
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold text-ink dark:text-gray-100">
              Week {selectedWeek}
              {selectedWeek === currentWeek && (
                <span className="rounded-full bg-primary-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                  Current
                </span>
              )}
            </h2>
            <MatchupList
              matchups={matchupsByWeek.get(selectedWeek) ?? []}
              teamNameById={teamNameById}
            />
          </section>
        </>
      )}
    </div>
  )
}
