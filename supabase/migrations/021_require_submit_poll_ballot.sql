-- 020 added submit_poll_ballot as an atomic, guaranteed-safe way to submit a
-- ballot, but never actually closed off the old path it was meant to
-- replace: the member-only INSERT/UPDATE/DELETE policies from 015 were left
-- in place, so any authenticated member could still write to
-- poll_submissions directly via PostgREST (a stale client, a hand-crafted
-- API call), bypassing the RPC entirely and reintroducing the exact
-- non-atomic delete-then-insert failure mode 020 exists to close.
--
-- Dropping these three policies is sufficient on its own to block direct
-- member writes — RLS is already enabled (002) and defaults to deny when no
-- policy grants an operation, no GRANT/REVOKE needed. This does not affect:
--   - members reading their own submissions ("Users can view own
--     submissions", 015) — untouched, SELECT-only
--   - the commissioner's "Commissioner can manage all submissions" FOR ALL
--     policy (010) — a separate, independent policy, still fully in effect
--   - submit_poll_ballot itself (020) — SECURITY DEFINER functions run as
--     the function owner, not as `authenticated`, so they bypass RLS
--     regardless of these policies

DROP POLICY IF EXISTS "Users can create own submissions while week is open" ON poll_submissions;
DROP POLICY IF EXISTS "Users can update own submissions while week is open" ON poll_submissions;
DROP POLICY IF EXISTS "Users can delete own submissions while week is open" ON poll_submissions;
