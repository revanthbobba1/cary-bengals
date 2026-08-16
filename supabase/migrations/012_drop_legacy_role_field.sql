-- Remove the legacy singular 'role' field now that 'roles' (array) is the single source of
-- truth for role checks (see 011_fix_role_metadata_format.sql). Nothing in the codebase reads
-- 'role' -- it was leftover from before the array-based role design.
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data - 'role'
WHERE raw_app_meta_data ? 'role';
