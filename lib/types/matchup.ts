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
}
