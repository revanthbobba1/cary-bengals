-- Follow-up to 054, found by running supabase/tests/verify_054.sql against the live project.
--
-- 054 did `REVOKE ALL ... FROM PUBLIC`, but Supabase's default privileges grant EXECUTE on new
-- public-schema functions directly to anon, authenticated, and service_role, so that revoke removed
-- nothing and anon/authenticated could still call get_unsubmitted_voters(). The function's own
-- `auth.role() = 'service_role'` check already refused them (nothing was exposed), but the grant
-- should not exist: this makes the database refuse the call before the function body runs, with the
-- in-function check left as a second layer.
--
-- Lesson for later migrations in this schema: a service_role-only function needs an explicit
-- REVOKE from anon and authenticated, not just from PUBLIC.

REVOKE ALL ON FUNCTION public.get_unsubmitted_voters(uuid) FROM anon, authenticated;
