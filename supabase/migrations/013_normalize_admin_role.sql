-- Normalize every user to have the 'admin' role, per the original design intent (all 12 league
-- members were meant to have admin access to /admin; 'member' was never meant to grant reduced
-- access -- admin/member have always been functionally identical). Additive only: doesn't strip
-- any existing 'member' tag, just ensures 'admin' is present alongside it.
UPDATE auth.users
SET raw_app_meta_data = jsonb_set(
  raw_app_meta_data,
  '{roles}',
  (COALESCE(raw_app_meta_data->'roles', '[]'::jsonb) || '["admin"]'::jsonb)
)
WHERE NOT (COALESCE(raw_app_meta_data->'roles', '[]'::jsonb) ? 'admin');
