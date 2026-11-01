import type { ArticleKind } from '@/lib/types/article'
import type { Matchup } from '@/lib/types/matchup'
import type { Team } from '@/lib/types/poll'

/** The slice of a `matchups` row the article editor needs to prepopulate a matchup. */
export type PrefillSourceMatchup = Pick<
  Matchup,
  | 'home_team_id'
  | 'away_team_id'
  | 'home_score'
  | 'away_score'
  | 'winner'
  | 'home_projected_score'
  | 'away_projected_score'
>

/** Same fields as the editor's EditableMatchup, minus the client-only key and body. */
export interface PrefilledMatchup {
  away_team_name: string
  home_team_name: string
  away_team_id: string
  home_team_id: string
  away_record: string
  home_record: string
  line: string
  away_score: number | null
  home_score: number | null
}

// teams.name carries a trailing "(Owner)" suffix for the poll UI's benefit, but article_matchups'
// display convention never includes it. Strip exactly that known suffix rather than guessing with
// a generic regex that could eat a legitimate parenthetical nickname.
export function teamDisplayName(team: Team): string {
  const suffix = `(${team.owner_name})`
  return team.name.endsWith(suffix) ? team.name.slice(0, -suffix.length).trim() : team.name
}

/**
 * Builds the editor's starting matchups from ESPN-synced data. Byes are skipped (no opponent to
 * write about). The line is the projected spread -- favorite's name plus the margin, matching the
 * "Monkey -1.3" shape -- and only applies to previews; scores only to recaps whose game is final.
 */
export function prefillMatchupsFromEspn(
  espnMatchups: PrefillSourceMatchup[],
  teams: Team[],
  teamRecords: Record<string, string>,
  kind: ArticleKind
): PrefilledMatchup[] {
  const teamsById = new Map(teams.map((t) => [t.id, t]))
  const prefilled: PrefilledMatchup[] = []

  for (const m of espnMatchups) {
    if (!m.away_team_id) continue
    const home = teamsById.get(m.home_team_id)
    const away = teamsById.get(m.away_team_id)
    if (!home || !away) continue

    let line = ''
    if (kind === 'preview' && m.home_projected_score != null && m.away_projected_score != null) {
      const margin = Math.abs(m.home_projected_score - m.away_projected_score).toFixed(1)
      // A pick'em has no favorite, so leave the line for the author rather than print "-0.0".
      if (Number(margin) > 0) {
        const favorite = m.home_projected_score > m.away_projected_score ? home : away
        line = `${teamDisplayName(favorite)} -${margin}`
      }
    }

    const isFinal = m.winner !== 'UNDECIDED'
    prefilled.push({
      away_team_name: teamDisplayName(away),
      home_team_name: teamDisplayName(home),
      away_team_id: away.id,
      home_team_id: home.id,
      away_record: teamRecords[away.id] ?? '',
      home_record: teamRecords[home.id] ?? '',
      line,
      away_score: kind === 'recap' && isFinal ? m.away_score : null,
      home_score: kind === 'recap' && isFinal ? m.home_score : null,
    })
  }

  return prefilled
}
