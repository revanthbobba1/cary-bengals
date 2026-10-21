import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * The ONLY file in this app allowed to read SUPABASE_SERVICE_ROLE_KEY. Never import this outside
 * app/api/espn/sync-matchups/route.ts and app/api/espn/sync-all/route.ts, and never pass its
 * client anywhere a request body or user input could reach — it bypasses Row Level Security on
 * every table in the project, not just what jwt_has_role('commissioner') covers.
 *
 * Exists for the scheduled cron paths, which have no commissioner session (no human signed in)
 * to satisfy the jwt_has_role('commissioner') check every sync RPC normally requires. Both Route
 * Handlers that call this check a separate shared secret (x-cron-secret) BEFORE this function is
 * ever called — see docs/ESPN_INTEGRATION_PLAN.md's Phase 8c-cron notes for the full reasoning
 * behind choosing a service-role key over a dedicated bot Supabase Auth account.
 */
export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
