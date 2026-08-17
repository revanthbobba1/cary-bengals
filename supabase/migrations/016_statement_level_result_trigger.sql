-- The original trigger (003_create_poll_functions.sql) is FOR EACH ROW, so a single
-- 12-team ballot submission (delete 12 rows, insert 12 rows) runs the full
-- recalculate_poll_results() DELETE+INSERT aggregation 24 times instead of once.
-- Beyond the wasted work, this is a real correctness risk: under two members
-- submitting concurrently near a deadline, one transaction's DELETE FROM
-- poll_results can miss rows the other transaction inserted after its snapshot,
-- so the re-INSERT can violate UNIQUE(poll_week_id, team_id) — a spurious failure
-- on a legitimate submission that has nothing to do with the actual RLS/deadline
-- checks.
--
-- Fix: a single FOR EACH STATEMENT trigger per operation, using transition tables
-- to find which poll_week_id(s) were touched, recalculating each exactly once. An
-- advisory lock scoped to the poll_week_id serializes concurrent recalculations
-- for the same week within the transaction (auto-released at commit/rollback),
-- closing the race described above.

DROP TRIGGER IF EXISTS poll_submission_changed ON poll_submissions;

CREATE OR REPLACE FUNCTION trigger_recalculate_poll_results()
RETURNS trigger AS $$
DECLARE
  wk uuid;
BEGIN
  FOR wk IN SELECT DISTINCT poll_week_id FROM changed LOOP
    PERFORM pg_advisory_xact_lock(hashtext(wk::text));
    PERFORM recalculate_poll_results(wk);
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER poll_submission_inserted
  AFTER INSERT ON poll_submissions
  REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION trigger_recalculate_poll_results();

CREATE TRIGGER poll_submission_deleted
  AFTER DELETE ON poll_submissions
  REFERENCING OLD TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION trigger_recalculate_poll_results();

-- Dead code in practice today (the app only ever deletes+inserts, never issues a
-- real UPDATE against poll_submissions), kept for correctness/consistency so it
-- isn't a latent gap if that ever changes.
CREATE TRIGGER poll_submission_updated
  AFTER UPDATE ON poll_submissions
  REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION trigger_recalculate_poll_results();
