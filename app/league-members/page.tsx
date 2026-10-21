import { Authors, allAuthors } from 'contentlayer/generated'
import { MDXLayoutRenderer } from 'pliny/mdx-components'
import AuthorLayout from '@/layouts/AuthorLayout'
import { coreContent } from 'pliny/utils/contentlayer'
import { genPageMetadata } from 'app/seo'
import { createPublicClient } from '@/lib/supabase/public'
import siteMetadata from '@/data/siteMetadata'
import type { RosterPlayer } from '@/lib/types/roster'

export const metadata = genPageMetadata({ title: 'League Members' })

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export default async function Page() {
  const teamByOwner = new Map<string, { id: string; name: string }>()
  const rosterByTeamId = new Map<string, RosterPlayer[]>()
  const currentSeason = siteMetadata.currentSeason

  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project-ref')
  ) {
    const supabase = createPublicClient()
    const { data: teams, error } = await supabase
      .from('teams')
      .select('id, name, owner_name')
      .eq('season_year', currentSeason)

    if (!error) {
      for (const team of teams ?? []) {
        const owner = normalizeName(team.owner_name)
        if (owner && !teamByOwner.has(owner)) {
          teamByOwner.set(owner, { id: team.id, name: team.name })
        }
      }

      const teamIds = (teams ?? []).map((team) => team.id)
      if (teamIds.length > 0) {
        // Starters first within each team, matching the grouping RosterModal itself renders.
        const { data: rosterRows } = await supabase
          .from('team_rosters')
          .select('*')
          .in('team_id', teamIds)
          .order('is_starter', { ascending: false })
          .order('player_name')

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
        {allAuthors.map((author) => {
          const mainContent = coreContent(author as Authors)
          const teamInfo = teamByOwner.get(normalizeName(author.name.split(' ')[0]))
          return (
            <div key={author.slug} className="flex flex-col items-center">
              <AuthorLayout
                content={mainContent}
                team={teamInfo?.name}
                roster={teamInfo ? rosterByTeamId.get(teamInfo.id) : undefined}
              >
                <MDXLayoutRenderer code={author.body.code} />
              </AuthorLayout>
            </div>
          )
        })}
      </div>
    </>
  )
}
