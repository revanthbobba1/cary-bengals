-- Root-cause fix: existing users have raw_app_meta_data.role as a single STRING
-- (Supabase's default invite shape, e.g. {"role": "admin"}), but every RLS policy in this
-- project (002, 007, 010) checks raw_app_meta_data.roles as a JSON ARRAY. That mismatch means
-- every 'admin'/'commissioner'-role-gated policy has been silently evaluating to false for
-- existing users -- almost certainly the cause of the 403 seen earlier when 007's role-gated
-- INSERT policy was active.
--
-- Backfill 'roles' as an array for any user that has the old singular 'role' field but no
-- 'roles' array yet, so this generalizes to every future invited member, not just one account.
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object(
  'roles', jsonb_build_array(raw_app_meta_data->>'role')
)
WHERE raw_app_meta_data ? 'role'
  AND NOT (raw_app_meta_data ? 'roles');

-- Grant the account owner the commissioner role, as requested.
UPDATE auth.users
SET raw_app_meta_data = jsonb_set(
  raw_app_meta_data,
  '{roles}',
  (COALESCE(raw_app_meta_data->'roles', '[]'::jsonb) || '["commissioner"]'::jsonb)
)
WHERE id = 'a85c8e45-402e-4179-b624-682cba2e45d0'
  AND NOT (COALESCE(raw_app_meta_data->'roles', '[]'::jsonb) ? 'commissioner');

-- NOTE: existing sessions/JWTs won't pick this up until the token refreshes. Sign out and back
-- in (or wait for the ~1hr auto-refresh) before relying on the commissioner-gated pages.
