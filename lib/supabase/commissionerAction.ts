// Shared auth gate + result type for commissioner-only Server Actions (app/admin/commissioner/).
// Extracted once a second Server Action file needed the identical check -- see
// teams-sync-actions.ts for the original commentary on why these are Server Actions rather than
// a Route Handler, and why errors are returned as a string rather than thrown.

import { createClient } from '@/lib/supabase/server'
import { isCommissioner } from '@/lib/supabase/roles'

export type SupabaseServerClient = ReturnType<typeof createClient>

export type ActionResult<T> = { data: T; error: null } | { data: null; error: string }

export async function getCommissionerClient(): Promise<
  { supabase: SupabaseServerClient; error: null } | { supabase: null; error: string }
> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !isCommissioner(user)) {
    return { supabase: null, error: 'Commissioner access required.' }
  }
  return { supabase, error: null }
}
