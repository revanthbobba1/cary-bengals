export interface Team {
  id: string
  name: string
  owner_name: string
  season_year: number
  created_at: string
  updated_at: string
}

export interface PollWeek {
  id: string
  season_year: number
  week_number: number
  deadline: string
  is_locked: boolean
  created_at: string
  updated_at: string
}

export interface PollSubmission {
  id: string
  poll_week_id: string
  user_id: string
  team_id: string
  rank: number
  team_record: string | null
  submitted_at: string
  updated_at: string
}

export interface PollResult {
  id: string
  poll_week_id: string
  team_id: string
  final_rank: number
  avg_rank_score: number
  team_record: string | null
  trend: string
  num_ballots: number
  created_at: string
}

// Extended types for joined queries
export interface PollResultWithTeam extends PollResult {
  team: Team
}

// Shape returned by the get_poll_week_submission_status RPC
// (supabase/migrations/017_submission_status_function.sql)
export interface SubmissionStatus {
  user_id: string
  email: string
  submission_count: number
  has_submitted: boolean
  submitted_at: string | null
}

// Form data types
export interface PollSubmissionForm {
  poll_week_id: string
  rankings: Array<{
    team_id: string
    rank: number
    team_record: string
  }>
}
