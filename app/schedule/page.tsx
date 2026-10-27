import { genPageMetadata } from 'app/seo'
import siteMetadata from '@/data/siteMetadata'
import { loadScheduleData } from '@/lib/espn/scheduleData'
import ScheduleWeekBrowser from '@/components/ScheduleWeekBrowser'

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
  // Similar in shape to /articles' `season` param, but the two pages' default-resolution logic
  // isn't identical -- /articles always falls back to the newest season present; /schedule
  // prefers the current week specifically, only falling further back if that week turns out to
  // have no synced matchups (see ScheduleWeekBrowser's own comment).
  searchParams: { week?: string | string[] }
}) {
  const { currentWeek, teamNameById, teamLogoById, matchups } = await loadScheduleData(
    siteMetadata.currentSeason
  )

  // An explicit empty value (`?week=`) must not silently become week 0 -- `Number('')` is `0`,
  // not `NaN`, so it would otherwise pass straight through as if week 0 had been requested.
  const rawWeek = typeof searchParams.week === 'string' ? searchParams.week : ''
  const parsedWeek = rawWeek !== '' ? Number(rawWeek) : Number.NaN
  const initialWeek = Number.isFinite(parsedWeek) ? parsedWeek : null

  return (
    <div className="container py-12">
      <div className="space-y-2 pb-8 md:space-y-5">
        <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-ink dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
          Schedule
        </h1>
      </div>
      <ScheduleWeekBrowser
        matchups={matchups}
        teamNameById={teamNameById}
        teamLogoById={teamLogoById}
        currentWeek={currentWeek}
        initialWeek={initialWeek}
      />
    </div>
  )
}
