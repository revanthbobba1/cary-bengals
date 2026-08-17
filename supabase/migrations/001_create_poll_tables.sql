-- Create teams table
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  season_year INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(name, season_year)
);

-- Create poll_weeks table
CREATE TABLE poll_weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_year INTEGER NOT NULL,
  week_number INTEGER NOT NULL,
  deadline TIMESTAMPTZ NOT NULL,
  is_locked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(season_year, week_number)
);

-- Create poll_submissions table
CREATE TABLE poll_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_week_id UUID NOT NULL REFERENCES poll_weeks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL CHECK (rank >= 1 AND rank <= 12),
  team_record TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(poll_week_id, user_id, team_id),
  UNIQUE(poll_week_id, user_id, rank)
);

-- Create poll_results table
CREATE TABLE poll_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_week_id UUID NOT NULL REFERENCES poll_weeks(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  final_rank INTEGER NOT NULL,
  avg_rank_score DECIMAL(5,2) NOT NULL,
  team_record TEXT,
  trend TEXT,
  num_ballots INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(poll_week_id, team_id),
  UNIQUE(poll_week_id, final_rank)
);

-- Create indexes
CREATE INDEX idx_teams_season ON teams(season_year);
CREATE INDEX idx_poll_weeks_season_week ON poll_weeks(season_year, week_number);
CREATE INDEX idx_poll_weeks_deadline ON poll_weeks(deadline);
CREATE INDEX idx_poll_submissions_week ON poll_submissions(poll_week_id);
CREATE INDEX idx_poll_submissions_user ON poll_submissions(user_id);
CREATE INDEX idx_poll_results_week ON poll_results(poll_week_id);
CREATE INDEX idx_poll_results_rank ON poll_results(poll_week_id, final_rank);
