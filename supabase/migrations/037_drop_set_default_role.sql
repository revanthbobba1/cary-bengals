-- Removes the actual source of the `{"role": "member"}` metadata: a trigger that has been running
-- in production the whole time and appears in no migration in this repo.
--
--   CREATE TRIGGER on_auth_user_created BEFORE INSERT ON auth.users
--     FOR EACH ROW EXECUTE FUNCTION set_default_role();
--
--   -- public.set_default_role()
--   IF NOT (NEW.raw_app_meta_data ? 'role') THEN
--     NEW.raw_app_meta_data = NEW.raw_app_meta_data || '{"role": "member"}'::jsonb;
--   END IF;
--
-- It was created by hand in the SQL editor, back when `member` was a live role. Every account
-- inserted since has been stamped with a key the app has never read -- `member` was dropped in 014
-- and the singular `role` key in 012, but both of those only cleaned up existing rows, so this kept
-- quietly refilling what they emptied. 011, 012, 013, 014, 025 and 036 were all, in whole or in
-- part, responses to metadata this trigger wrote.
--
-- CORRECTION TO 036's COMMENTS: 036 attributes the `{"role": "member"}` shape to someone typing it
-- into the Dashboard's App Metadata box. That was wrong -- nobody typed it, the database wrote it
-- on every insert. 036's normalization is still right (it has to tolerate bad input either way,
-- and it is what makes new invites come out correct today), but its explanation of where the bad
-- input came from was not. The docs are corrected alongside this file.
--
-- With 036 applied, the two triggers actively fight each other on every insert: `on_auth_user_created`
-- (alphabetically first) adds `role: member`, then `on_auth_user_created_grant_admin` strips it back
-- out. Correct end state, pure waste to get there, and a real trap for the next person reading only
-- the migrations. Dropping it leaves the repo's migrations as a truthful description of the table.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.set_default_role();

-- Sweep up anything the trigger stamped that 036 left behind. 036 deliberately leaves a
-- never-invited account's metadata untouched (its invite-only guard), so a self-signup row could
-- still be carrying `role: member` -- there are none today, but this file is what makes that
-- true regardless of when it runs.
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data - 'role'
WHERE raw_app_meta_data ? 'role';
