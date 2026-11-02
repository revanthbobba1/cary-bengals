import { members } from '@/data/members'
import MemberLayout from '@/layouts/MemberLayout'
import { genPageMetadata } from 'app/seo'
import { createPublicClient } from '@/lib/supabase/public'
import siteMetadata from '@/data/siteMetadata'
import type { RosterPlayer } from '@/lib/types/roster'

export const metadata = genPageMetadata({ title: 'League Members' })

// Rendered on every request, like /poll and /admin: rosters, team names, and records change when
// the commissioner runs an ESPN refresh, and a prerendered copy stayed stale on Netlify even after
// revalidatePath() ran. The two small Supabase queries per visit are cheap at this league's size.
export const dynamic = 'force-dynamic'

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export default async function Page() {
  const teamByOwner = new Map<string, { id: string; name: string; logo: string | null }>()
  const rosterByTeamId = new Map<string, RosterPlayer[]>()
  const currentSeason = siteMetadata.currentSeason

  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project-ref')
  ) {
    const supabase = createPublicClient()
    const { data: teams, error } = await supabase
      .from('teams')
      .select('id, name, owner_name, espn_logo_url')
      .eq('season_year', currentSeason)

    if (error) {
      console.error('Failed to load teams for League Members:', error)
    } else {
      for (const team of teams ?? []) {
        const owner = normalizeName(team.owner_name)
        if (owner && !teamByOwner.has(owner)) {
          teamByOwner.set(owner, { id: team.id, name: team.name, logo: team.espn_logo_url })
        }
      }

      const teamIds = (teams ?? []).map((team) => team.id)
      if (teamIds.length > 0) {
        // Starters first within each team, matching the grouping RosterModal itself renders.
        // sort_order (not player_name) preserves ESPN's own roster-entry order, which
        // RosterModal needs as the tiebreaker for its own slot/position-based ordering.
        const { data: rosterRows, error: rosterError } = await supabase
          .from('team_rosters')
          .select('*')
          .in('team_id', teamIds)
          .order('is_starter', { ascending: false })
          .order('sort_order')

        if (rosterError) console.error('Failed to load rosters for League Members:', rosterError)

        for (const row of (rosterRows as RosterPlayer[] | null) ?? []) {
          const players = rosterByTeamId.get(row.team_id) ?? []
          players.push(row)
          rosterByTeamId.set(row.team_id, players)
        }
      }
    }
  }

  return (
    <>
      <div className="space-y-2 pb-8 pt-6 md:space-y-5">
        <h1 className="text-3xl font-extrabold leading-9 tracking-tight text-ink dark:text-gray-100 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14">
          League Members
        </h1>
      </div>
      <hr className="border-gray-200 dark:border-gray-700 mb-6" />
      <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((member) => {
          const teamInfo = teamByOwner.get(normalizeName(member.name.split(' ')[0]))
          return (
            <div key={member.slug} className="flex flex-col items-center">
              <MemberLayout
                content={member}
                team={teamInfo?.name}
                teamLogo={teamInfo?.logo}
                roster={teamInfo ? rosterByTeamId.get(teamInfo.id) : undefined}
              />
            </div>
          )
        })}
      </div>
    </>
  )
}
