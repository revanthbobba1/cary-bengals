import { genPageMetadata } from 'app/seo'
import { createPublicClient } from '@/lib/supabase/public'
import siteMetadata from '@/data/siteMetadata'
import MatchupList from '@/components/MatchupList'
import type { Matchup } from '@/lib/types/matchup'

export const metadata = genPageMetadata({ title: 'Scoreboard' })

// Rendered on every request, like /league-members and /articles: scores change from a commissioner
// refresh or a scheduled sync, and a prerendered copy stayed stale on Netlify even after
// revalidatePath() ran (see docs/NETLIFY_DEPLOYMENT.md, "Page Caching and Freshness"). Live scores
// during a game are the one place in this app where staleness would be most visible.
export const dynamic = 'force-dynamic'

export default async function Page() {
  let matchups: Matchup[] = []
  const teamNameById = new Map<string, string>()
  let currentWeek: number | null = null

  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project-ref')
  ) {
    const supabase = createPublicClient()
    const currentSeason = siteMetadata.currentSeason

    const { data: scheduleState, error: scheduleStateError } = await supabase
      .from('espn_schedule_state')
      .select('current_week')
      .eq('season_year', currentSeason)
      .maybeSingle()

    if (scheduleStateError) {
      console.error('Failed to load schedule state for Scoreboard:', scheduleStateError)
    } else {
      currentWeek = scheduleState?.current_week ?? null
    }

    if (currentWeek !== null) {
      const { data: teams, error: teamsError } = await supabase
        .from('teams')
        .select('id, name')
        .eq('season_year', currentSeason)

      if (teamsError) {
        console.error('Failed to load teams for Scoreboard:', teamsError)
      } else {
        for (const team of teams ?? []) {
          teamNameById.set(team.id, team.name)
        }
      }

      const { data: matchupRows, error: matchupsError } = await supabase
        .from('matchups')
        .select('*')
        .eq('season_year', currentSeason)
        .eq('week_number', currentWeek)
        .order('espn_matchup_id')

      if (matchupsError) {
        console.error('Failed to load matchups for Scoreboard:', matchupsError)
      } else {
        matchups = (matchupRows as Matchup[] | null) ?? []
      }
    }
  }

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
        <MatchupList matchups={matchups} teamNameById={teamNameById} />
      )}
    </div>
  )
}
