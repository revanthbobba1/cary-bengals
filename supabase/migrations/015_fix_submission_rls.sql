-- Fixes two RLS bugs on poll_submissions found by the poll-lock/deadline audit
-- (see docs/POLL_SYSTEM_PLAN.md):
--
-- 1. F1 (P0): there has been NO SELECT policy letting a member read their own
--    submissions since migration 010 replaced the old admin-gated SELECT policy
--    with a commissioner-only one. This is the real, current cause of the
--    "submissions not persisting" symptom — inserts always worked, but every
--    non-commissioner member's read of their own ballot was silently filtered
--    by RLS. It only ever looked fine because testing was done from the
--    commissioner account, which bypasses this via the "Commissioner can manage
--    all submissions" FOR ALL policy.
--
-- 2. F2: the INSERT policy (008) only checks user_id = auth.uid() — unlike
--    UPDATE/DELETE, it never checked poll_weeks.is_locked/deadline. A shared
--    poll_week_is_open() predicate closes that gap and keeps all three from
--    drifting apart again.
--
-- This supersedes the long-standing backlog item "restore the admin role check
-- on INSERT/DELETE" (see supabase/migrations/README.md, 008's comment). That
-- plan is intentionally NOT followed: after 013/014, `admin` is granted to
-- every user and checked nowhere else, so gating INSERT on it again would add
-- no real access control while creating a silent-403 footgun for the next
-- hand-invited member. The actual gap was always the week-open check, not a
-- missing role check.

CREATE OR REPLACE FUNCTION poll_week_is_open(p_poll_week_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM poll_weeks pw
    WHERE pw.id = p_poll_week_id
      AND pw.is_locked = false
      AND pw.deadline > now()
  )
$$;

-- F1: members can read their own submissions regardless of role.
CREATE POLICY "Users can view own submissions"
  ON poll_submissions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- F2: bring INSERT in line with UPDATE/DELETE's week-open check.
DROP POLICY IF EXISTS "Authenticated users can create own submissions" ON poll_submissions;
CREATE POLICY "Users can create own submissions while week is open"
  ON poll_submissions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND poll_week_is_open(poll_week_id));

DROP POLICY IF EXISTS "Authenticated users can delete own submissions before deadline" ON poll_submissions;
CREATE POLICY "Users can delete own submissions while week is open"
  ON poll_submissions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() AND poll_week_is_open(poll_week_id));

-- Dead code in practice (the app only ever does delete+insert, never UPDATE),
-- but kept consistent with the other two so it isn't a latent trap later.
DROP POLICY IF EXISTS "Users can update own submissions before deadline" ON poll_submissions;
CREATE POLICY "Users can update own submissions while week is open"
  ON poll_submissions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND poll_week_is_open(poll_week_id))
  WITH CHECK (user_id = auth.uid() AND poll_week_is_open(poll_week_id));
