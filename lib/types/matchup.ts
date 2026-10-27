import type { RosterPlayer } from '@/lib/types/roster'

// Same per-player shape as RosterPlayer, minus the team-scoped fields (this is matchup-scoped
// instead) and injured/acquisition_type (mRoster-only -- the box score's mLiveScoring view has
// neither; it uses the richer availability field below instead), plus points -- kept
// structurally linked via Omit/intersection rather than a second hand-copied field list, so the
// two don't silently drift apart.
// Why a player has no stat line (null = they played): bye = NFL team on bye, ir = IR slot,
// out = ESPN injury status OUT, dnp = team played but the player didn't, pending = no line yet and
// not a bye (game hasn't started). Derived in the ESPN service (backend/app/services/boxscore.py).
export type PlayerAvailability = 'bye' | 'ir' | 'out' | 'dnp' | 'pending'

export type MatchupPlayerScore = Omit<
  RosterPlayer,
  'team_id' | 'synced_at' | 'injured' | 'acquisition_type'
> & {
  points: number
  // Already-labeled non-zero counts ({ "Passing Yards": 275 }). Key order is not preserved by
  // Postgres JSONB, so render via lib/espn/statDisplay.ts, never by iterating the object.
  stat_breakdown: Record<string, number>
  availability: PlayerAvailability | null
}

export interface Matchup {
  id: string
  season_year: number
  week_number: number
  is_playoffs: boolean
  // A playoff bye: the present team is always home_*, away_* are null (see migration 046).
  is_bye: boolean
  home_team_id: string
  away_team_id: string | null
  home_score: number
  away_score: number | null
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
