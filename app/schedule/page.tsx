import { genPageMetadata } from 'app/seo'
import { createPublicClient } from '@/lib/supabase/public'
import siteMetadata from '@/data/siteMetadata'
import MatchupList from '@/components/MatchupList'
import type { Matchup } from '@/lib/types/matchup'

export const metadata = genPageMetadata({ title: 'Schedule' })

// Same force-dynamic reasoning as /scoreboard and /league-members -- see
// docs/NETLIFY_DEPLOYMENT.md, "Page Caching and Freshness".
export const dynamic = 'force-dynamic'

export default async function Page() {
  const matchupsByWeek = new Map<number, Matchup[]>()
  const teamNameById = new Map<string, string>()
  let currentWeek: number | null = null

  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project-ref')
  ) {
    const supabase = createPublicClient()
    const currentSeason = siteMetadata.currentSeason

    const [scheduleStateResult, teamsResult, matchupsResult] = await Promise.all([
      supabase
        .from('espn_schedule_state')
        .select('current_week')
        .eq('season_year', currentSeason)
        .maybeSingle(),
      supabase.from('teams').select('id, name').eq('season_year', currentSeason),
      supabase
        .from('matchups')
        .select('*')
        .eq('season_year', currentSeason)
        .order('week_number')
        .order('espn_matchup_id'),
    ])

    if (scheduleStateResult.error) {
      console.error('Failed to load schedule state for Schedule:', scheduleStateResult.error)
    } else {
      currentWeek = scheduleStateResult.data?.current_week ?? null
    }

    if (teamsResult.error) {
      console.error('Failed to load teams for Schedule:', teamsResult.error)
    } else {
      for (const team of teamsResult.data ?? []) {
        teamNameById.set(team.id, team.name)
      }
    }

    if (matchupsResult.error) {
      console.error('Failed to load matchups for Schedule:', matchupsResult.error)
    } else {
      for (const matchup of (matchupsResult.data as Matchup[] | null) ?? []) {
        const weekMatchups = matchupsByWeek.get(matchup.week_number) ?? []
        weekMatchups.push(matchup)
        matchupsByWeek.set(matchup.week_number, weekMatchups)
      }
    }
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
