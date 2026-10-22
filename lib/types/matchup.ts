export interface MatchupPlayerScore {
  id: string
  player_name: string
  position: string
  pro_team: string
  lineup_slot: string
  is_starter: boolean
  points: number
  sort_order: number
}

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
  // Populated once a week has been synced while it was current (see lib/espn/boxScoreSync.ts) --
  // null both before that first sync and for a week that hasn't happened yet. Once written, a
  // week's rows are never touched again by a later sync (only the current week's matchups ever
  // appear in a sync payload), so this persists indefinitely as that week's de facto final score.
  home_player_scores: MatchupPlayerScore[] | null
  away_player_scores: MatchupPlayerScore[] | null
}
