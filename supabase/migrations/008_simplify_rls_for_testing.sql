-- Temporarily simplify policies to debug
-- All authenticated users can submit (we'll add role check back once working)

DROP POLICY IF EXISTS "Users can create own submissions" ON poll_submissions;
DROP POLICY IF EXISTS "Users can delete own submissions" ON poll_submissions;

CREATE POLICY "Authenticated users can create own submissions"
  ON poll_submissions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Authenticated users can delete own submissions before deadline"
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
