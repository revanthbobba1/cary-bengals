// Read path for /history (issue #194). The aggregation lives in SQL views (migration 052) because
// Supabase's API returns at most 1000 rows per request and silently drops the rest; everything
// loaded here is either one row per team-season, or a `limit`ed slice of a view.
//
// Playoff placement is the exception: matchups carry no winners-bracket flag, so champions are
// inferred per season in lib/history/bracket.ts from that season's 19 playoff rows.

import { createPublicClient } from '@/lib/supabase/public'
import { teamLogoOrAvatar, normalizeName } from '@/lib/memberAvatar'
import { inferBracket, type Bracket, type PlayoffRow } from '@/lib/history/bracket'

// PostgREST's default max rows per response. Hitting it exactly means rows were probably cut off.
const MAX_ROWS = 1000

export interface TeamSeason {
  team_id: string
  season_year: number
  owner_id: string
  owner_name: string
  team_name: string
  wins: number
  losses: number
  ties: number
  points_for: number
  points_against: number
  all_play_wins: number
  all_play_losses: number
  all_play_ties: number
  standings_rank: number
  points_for_rank: number
}

export interface TeamInfo {
  id: string
  season_year: number
  name: string
  owner_id: string
  owner_name: string
  logo: string | null
}

export interface SeasonResult {
  season: number
  bracket: Bracket | null
}

export interface HistoryBase {
  // Completed seasons, newest first.
  seasons: number[]
  teamSeasons: TeamSeason[]
  teamsById: Record<string, TeamInfo>
  results: Record<number, SeasonResult>
}

export interface OwnerSummary {
  ownerId: string
  // Lowercased first name -- the same key the league-members page and avatars use.
  slug: string
  name: string
  seasons: number
  wins: number
  losses: number
  ties: number
  winPct: number
  pointsFor: number
  pointsAgainst: number
  titles: number[]
  runnerUps: number[]
  playoffAppearances: number
  // Regular-season standings rank across seasons.
  bestRank: number
  worstRank: number
}

function isFixtureEnv(): boolean {
  return (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project-ref')
  )
}

export function ownerSlug(ownerName: string): string {
  return normalizeName(ownerName)
}

function winPct(wins: number, losses: number, ties: number): number {
  const games = wins + losses + ties
  return games === 0 ? 0 : (wins + ties / 2) / games
}

// PostgREST returns NUMERIC columns as JSON numbers, but sums over them as strings in some
// versions, so normalise anything that comes out of an aggregate.
export function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0)
}

export async function loadHistoryBase(): Promise<HistoryBase | null> {
  if (isFixtureEnv()) return null
  const supabase = createPublicClient()

  const [teamSeasonsResult, teamsResult, playoffsResult] = await Promise.all([
    supabase.from('league_team_seasons').select('*').limit(MAX_ROWS),
    supabase
      .from('teams')
      .select('id, season_year, name, owner_name, espn_owner_id, espn_logo_url')
      .not('espn_team_id', 'is', null)
      .limit(MAX_ROWS),
    supabase
      .from('matchups')
      .select(
        'season_year, week_number, is_bye, home_team_id, away_team_id, home_score, away_score, winner'
      )
      .eq('is_playoffs', true)
      .limit(MAX_ROWS),
  ])
  if (teamSeasonsResult.error || teamsResult.error || playoffsResult.error) {
    console.error(
      'Failed to load league history:',
      teamSeasonsResult.error ?? teamsResult.error ?? playoffsResult.error
    )
    return null
  }
  if (
    (teamsResult.data?.length ?? 0) >= MAX_ROWS ||
    (playoffsResult.data?.length ?? 0) >= MAX_ROWS
  ) {
    console.error('League history hit the row cap; older seasons may be missing.')
  }

  const teamSeasons: TeamSeason[] = (teamSeasonsResult.data ?? []).map((row) => ({
    ...row,
    wins: num(row.wins),
    losses: num(row.losses),
    ties: num(row.ties),
    points_for: num(row.points_for),
    points_against: num(row.points_against),
    all_play_wins: num(row.all_play_wins),
    all_play_losses: num(row.all_play_losses),
    all_play_ties: num(row.all_play_ties),
    standings_rank: num(row.standings_rank),
    points_for_rank: num(row.points_for_rank),
  }))

  const teamsById: Record<string, TeamInfo> = {}
  for (const team of teamsResult.data ?? []) {
    teamsById[team.id] = {
      id: team.id,
      season_year: team.season_year,
      name: team.name,
      owner_id: team.espn_owner_id as string,
      owner_name: team.owner_name,
      logo: teamLogoOrAvatar(team.espn_logo_url, team.owner_name),
    }
  }

  const seasons = [...new Set(teamSeasons.map((row) => row.season_year))].sort((a, b) => b - a)
  const results: Record<number, SeasonResult> = {}
  for (const season of seasons) {
    const rows = (playoffsResult.data ?? [])
      .filter((row) => row.season_year === season)
      .map(
        (row): PlayoffRow => ({
          week_number: row.week_number,
          is_bye: row.is_bye,
          home_team_id: row.home_team_id,
          away_team_id: row.away_team_id,
          home_score: num(row.home_score),
          away_score: num(row.away_score),
          winner: row.winner,
        })
      )
    results[season] = { season, bracket: inferBracket(rows) }
  }

  return { seasons, teamSeasons, teamsById, results }
}

// All-time rows per owner, from the team-season rows plus the inferred brackets. Computed here
// rather than read from `league_owner_totals` because titles and playoff appearances need the
// brackets anyway; the view stays as the SQL-side cross-check for the regular-season numbers.
export function summarizeOwners(base: HistoryBase): OwnerSummary[] {
  const byOwner = new Map<string, OwnerSummary>()
  for (const row of base.teamSeasons) {
    const existing = byOwner.get(row.owner_id)
    const summary: OwnerSummary = existing ?? {
      ownerId: row.owner_id,
      slug: ownerSlug(row.owner_name),
      name: row.owner_name,
      seasons: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      winPct: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      titles: [],
      runnerUps: [],
      playoffAppearances: 0,
      bestRank: Number.POSITIVE_INFINITY,
      worstRank: 0,
    }
    summary.seasons += 1
    summary.wins += row.wins
    summary.losses += row.losses
    summary.ties += row.ties
    summary.pointsFor += row.points_for
    summary.pointsAgainst += row.points_against
    summary.bestRank = Math.min(summary.bestRank, row.standings_rank)
    summary.worstRank = Math.max(summary.worstRank, row.standings_rank)

    const bracket = base.results[row.season_year]?.bracket
    if (bracket) {
      if (bracket.playoffTeamIds.includes(row.team_id)) summary.playoffAppearances += 1
      if (bracket.championId === row.team_id) summary.titles.push(row.season_year)
      if (bracket.runnerUpId === row.team_id) summary.runnerUps.push(row.season_year)
    }
    byOwner.set(row.owner_id, summary)
  }
  return [...byOwner.values()]
    .map((summary) => ({ ...summary, winPct: winPct(summary.wins, summary.losses, summary.ties) }))
    .sort((a, b) => b.winPct - a.winPct || b.pointsFor - a.pointsFor)
}
