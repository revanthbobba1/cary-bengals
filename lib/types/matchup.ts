export interface Matchup {
  id: string
  season_year: number
  week_number: number
  is_playoffs: boolean
  home_team_id: string
  away_team_id: string
  home_score: number
  away_score: number
  winner: string
  espn_matchup_id: number
  synced_at: string
  // Populated only for the current matchup period -- null for a past (final) or future (not yet
  // computed) week.
  home_projected_score: number | null
  away_projected_score: number | null
  home_win_probability: number | null
  away_win_probability: number | null
}
