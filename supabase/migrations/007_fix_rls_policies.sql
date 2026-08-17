-- Fix RLS policies to use JWT claims instead of querying auth.users

-- Drop old policies
DROP POLICY IF EXISTS "Admins can view all submissions" ON poll_submissions;
DROP POLICY IF EXISTS "Users can create own submissions" ON poll_submissions;
DROP POLICY IF EXISTS "Users can update own submissions before deadline" ON poll_submissions;
DROP POLICY IF EXISTS "Admins can manage teams" ON teams;
DROP POLICY IF EXISTS "Admins can manage poll weeks" ON poll_weeks;
DROP POLICY IF EXISTS "Admins can manage poll results" ON poll_results;

-- Recreate policies using JWT claims
CREATE POLICY "Admins can view all submissions"
  ON poll_submissions FOR SELECT
  TO authenticated
  USING (
    (auth.jwt()->>'app_metadata')::jsonb->'roles' ? 'admin'
  );

CREATE POLICY "Users can create own submissions"
  ON poll_submissions FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (auth.jwt()->>'app_metadata')::jsonb->'roles' ? 'admin'
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

CREATE POLICY "Users can delete own submissions"
  ON poll_submissions FOR DELETE
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

CREATE POLICY "Admins can manage teams"
  ON teams FOR ALL
  TO authenticated
  USING (
    (auth.jwt()->>'app_metadata')::jsonb->'roles' ? 'admin'
  );

CREATE POLICY "Admins can manage poll weeks"
  ON poll_weeks FOR ALL
  TO authenticated
  USING (
    (auth.jwt()->>'app_metadata')::jsonb->'roles' ? 'admin'
  );

CREATE POLICY "Admins can manage poll results"
  ON poll_results FOR ALL
  TO authenticated
  USING (
    (auth.jwt()->>'app_metadata')::jsonb->'roles' ? 'admin'
  );
