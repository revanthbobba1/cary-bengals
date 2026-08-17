-- Introduce a 'commissioner' role, distinct from 'admin'/'member', for poll administration.
--
-- IMPORTANT MANUAL STEP: this migration moves poll week / team management from requiring the
-- 'admin' role to requiring the 'commissioner' role. After running this migration, add
-- "commissioner" to your own account's app_metadata.roles array via the Supabase Dashboard
-- (Authentication -> Users -> select user -> Edit -> App Metadata), e.g.:
--   { "roles": ["admin", "commissioner"] }
-- Until you do, nobody will be able to create poll weeks, adjust deadlines, or manage teams.

-- Shared helper so role checks aren't duplicated across policies.
CREATE OR REPLACE FUNCTION jwt_has_role(role_name text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    ((auth.jwt()->>'app_metadata')::jsonb->'roles') ? role_name,
    false
  )
$$;

-- Replace 'admin'-gated management policies with 'commissioner'-gated ones.
DROP POLICY IF EXISTS "Admins can manage teams" ON teams;
DROP POLICY IF EXISTS "Admins can manage poll weeks" ON poll_weeks;
DROP POLICY IF EXISTS "Admins can manage poll results" ON poll_results;
DROP POLICY IF EXISTS "Admins can view all submissions" ON poll_submissions;

CREATE POLICY "Commissioner can manage teams"
  ON teams FOR ALL
  TO authenticated
  USING (jwt_has_role('commissioner'));

CREATE POLICY "Commissioner can manage poll weeks"
  ON poll_weeks FOR ALL
  TO authenticated
  USING (jwt_has_role('commissioner'));

CREATE POLICY "Commissioner can manage poll results"
  ON poll_results FOR ALL
  TO authenticated
  USING (jwt_has_role('commissioner'));

-- Commissioner can view every ballot (submission status dashboard); members can still only
-- see their own via the implicit lack of a broader SELECT policy plus their own INSERT/UPDATE.
CREATE POLICY "Commissioner can view all submissions"
  ON poll_submissions FOR SELECT
  TO authenticated
  USING (jwt_has_role('commissioner'));

-- Commissioner can override/delete any member's submission (e.g. correcting a bad ballot).
CREATE POLICY "Commissioner can manage all submissions"
  ON poll_submissions FOR ALL
  TO authenticated
  USING (jwt_has_role('commissioner'));
