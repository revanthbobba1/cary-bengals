import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import {
  isIdle,
  LAST_ACTIVE_COOKIE,
  lastActiveAt,
  SESSION_IDLE_REASON,
} from '@/lib/supabase/session'
import { redirect } from 'next/navigation'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims

  if (!claims) {
    redirect('/login?redirectTo=/admin')
  }

  // Second layer behind middleware, which normally catches an idle session first. A Server Component
  // can't clear cookies, but revoking the session still ends it: its refresh token stops working, so
  // the next request finds no session at all.
  if (isIdle(lastActiveAt(cookies().get(LAST_ACTIVE_COOKIE)?.value, claims))) {
    await supabase.auth.signOut({ scope: 'local' })
    redirect(`/login?redirectTo=/admin&reason=${SESSION_IDLE_REASON}`)
  }

  return <>{children}</>
}
