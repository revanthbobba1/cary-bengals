import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Cookie-free Supabase client for public, unauthenticated reads (published articles, poll
 * results). Deliberately NOT the `@supabase/ssr` server client from `./server.ts`: that one
 * reads `next/headers` cookies, which opts the calling route out of static rendering entirely.
 *
 * Using this instead lets public pages set `export const revalidate = ...` and be served from
 * the ISR cache between publishes, with `revalidatePath()` from the admin publish action making
 * a new article appear immediately rather than at the next revalidation.
 *
 * Only for data any visitor may see — it carries no session, so RLS evaluates it as `anon`.
 */
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
