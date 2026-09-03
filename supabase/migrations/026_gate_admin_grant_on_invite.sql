-- 025's trigger grants `admin` to every new auth.users row unconditionally, relying entirely on
-- the Supabase project's "allow new signups" setting (external to this repo) to keep the app
-- invite-only, as documented in CLAUDE.md ("No self-registration -- accounts are created only via
-- Supabase Dashboard invite"). If that setting were ever toggled on, any Google OAuth sign-in
-- would now auto-provision an "admin" account with no code-level check. `invited_at` is set by
-- Supabase specifically for accounts created via the Dashboard invite flow (confirmed non-null on
-- all 3 existing accounts) and stays null for self-service signups (including OAuth), so gating
-- the trigger on it enforces invite-only at the database level too, independent of that setting.
DROP TRIGGER IF EXISTS on_auth_user_created_grant_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_admin
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  WHEN (NEW.invited_at IS NOT NULL)
  EXECUTE FUNCTION public.grant_default_admin_role();
