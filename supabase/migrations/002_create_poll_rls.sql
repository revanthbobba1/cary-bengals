-- Enable RLS on all tables
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_results ENABLE ROW LEVEL SECURITY;

-- Public read access for poll results and teams
CREATE POLICY "Public can view teams"
  ON teams FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Public can view poll results"
  ON poll_results FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Public can view poll weeks"
  ON poll_weeks FOR SELECT
  TO anon, authenticated
  USING (true);

-- Admins can read all submissions (for viewing submission status)
CREATE POLICY "Admins can view all submissions"
  ON poll_submissions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND (raw_app_meta_data->>'roles')::jsonb ? 'admin'
    )
  );

-- Users can only insert/update their own submissions
CREATE POLICY "Users can create own submissions"
  ON poll_submissions FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      SELECT (raw_app_meta_data->>'roles')::jsonb ? 'admin'
      FROM auth.users
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update own submissions before deadline"
  ON poll_submissions FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM poll_weeks pw
      WHERE pw.id = poll_submissions.poll_week_id
      AND pw.is_locked = false
      AND pw.deadline > now()
    )
  );

-- Only admins can manage teams
CREATE POLICY "Admins can manage teams"
  ON teams FOR ALL
  TO authenticated
  USING (
    (
      SELECT (raw_app_meta_data->>'roles')::jsonb ? 'admin'
      FROM auth.users
      WHERE id = auth.uid()
    )
  );

-- Only admins can manage poll weeks
CREATE POLICY "Admins can manage poll weeks"
  ON poll_weeks FOR ALL
  TO authenticated
  USING (
    (
      SELECT (raw_app_meta_data->>'roles')::jsonb ? 'admin'
      FROM auth.users
      WHERE id = auth.uid()
    )
  );

-- Admins can manage poll results
CREATE POLICY "Admins can manage poll results"
  ON poll_results FOR ALL
  TO authenticated
  USING (
    (
      SELECT (raw_app_meta_data->>'roles')::jsonb ? 'admin'
      FROM auth.users
      WHERE id = auth.uid()
    )
  );
