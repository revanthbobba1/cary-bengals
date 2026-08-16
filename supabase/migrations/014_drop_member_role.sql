-- Drop the 'member' role entirely -- it has never been checked anywhere in the codebase and is
-- functionally identical to 'admin' (both give equal /admin access). Every existing user was
-- already normalized to have 'admin' in 013_normalize_admin_role.sql, so this is safe to strip.
UPDATE auth.users
SET raw_app_meta_data = jsonb_set(
  raw_app_meta_data,
  '{roles}',
  (SELECT COALESCE(jsonb_agg(r), '[]'::jsonb)
   FROM jsonb_array_elements(raw_app_meta_data->'roles') r
   WHERE r <> '"member"')
)
WHERE raw_app_meta_data->'roles' ? 'member';
