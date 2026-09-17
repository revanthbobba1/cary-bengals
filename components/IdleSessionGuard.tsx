'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  isIdle,
  LAST_ACTIVE_COOKIE,
  lastActiveAt,
  nowSeconds,
  SESSION_IDLE_REASON,
} from '@/lib/supabase/session'

// Interactions arrive far faster than this matters: one cookie write a minute is plenty against a
// multi-hour timeout.
const RECORD_THROTTLE_MS = 60 * 1000

// How often an open tab checks on itself, so an unattended tab signs out on its own once it goes
// idle rather than whenever someone next touches it.
const CHECK_INTERVAL_MS = 60 * 1000

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll'] as const

// 400 days, the same as Supabase's auth cookies. This one has to outlive them: if it expired first, a
// session in active use would fall back to its sign-in time and be ruled idle mid-use.
const LAST_ACTIVE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60

function readLastActive(): string | undefined {
  return document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith(`${LAST_ACTIVE_COOKIE}=`))
    ?.split('=')[1]
}

function writeLastActive(seconds: number) {
  const secure = window.location.protocol === 'https:' ? '; secure' : ''
  document.cookie = `${LAST_ACTIVE_COOKIE}=${seconds}; path=/; max-age=${LAST_ACTIVE_MAX_AGE_SECONDS}; samesite=lax${secure}`
}

// Decoded without verifying the signature. That's fine for the one thing it's used for -- deciding
// whether to sign this session out -- because a doctored token could only ever keep its own session
// alive a little longer client-side. The server-side checks verify the token properly.
function claimsFromAccessToken(token: string) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=')))
  } catch {
    return {}
  }
}

/**
 * Checks whether the session has gone idle -- and if not, optionally records this moment as activity.
 *
 * Always checks before recording. Otherwise returning to a tab after hours away would count the first
 * click back as activity and quietly revive a session that should already have ended.
 */
async function checkActivity({ record }: { record: boolean }) {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return

  const now = nowSeconds()
  const claims = claimsFromAccessToken(session.access_token)
  if (isIdle(lastActiveAt(readLastActive(), claims), now)) {
    // Revokes the session with Supabase too, and fires SIGNED_OUT, which useAuth listens for -- so
    // the header flips to "Login" without anything else needing to know this happened.
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) {
      // Revoking failed (offline, Supabase down), so the session is still here and SIGNED_OUT never
      // fired. Nothing to force from here -- the next interval tick tries again, and an /admin page
      // still leaves below, where middleware clears the cookies on the way back in. Not reloading:
      // the reload's own check would fail the same way and loop.
      console.error('Failed to revoke idle session:', error)
    }

    // Signing out doesn't un-render the page. On an admin page that would leave whatever it had
    // loaded -- drafts, other members' ballots -- on screen for whoever walks up to an unattended
    // tab, which is the very case this timeout exists for. A full load discards it, and `replace`
    // keeps Back from reopening it. Public pages can stay put; only the header changes.
    const { pathname } = window.location
    if (pathname.startsWith('/admin')) {
      const login = new URL('/login', window.location.origin)
      login.searchParams.set('redirectTo', pathname)
      login.searchParams.set('reason', SESSION_IDLE_REASON)
      window.location.replace(login)
    }
    return
  }
  if (record) writeLastActive(now)
}

/**
 * Enforces the inactivity timeout from lib/supabase/session.ts in the browser: records real use, and
 * signs an idle session out. Mounted once in the root layout so it covers every page, not just /admin.
 */
export default function IdleSessionGuard() {
  const pathname = usePathname()

  // Runs on mount and on every client-side navigation. A navigation is activity; on a full page load
  // this is also the first check the tab gets, so a tab restored days later signs out right away.
  useEffect(() => {
    void checkActivity({ record: true })
  }, [pathname])

  useEffect(() => {
    let lastRecorded = 0
    const onActivity = () => {
      const now = Date.now()
      if (now - lastRecorded < RECORD_THROTTLE_MS) return
      lastRecorded = now
      void checkActivity({ record: true })
    }
    // Switching back to a tab settles idleness immediately instead of on the next interval tick. It
    // doesn't count as activity by itself; the first real interaction after it does.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkActivity({ record: false })
    }
    const interval = window.setInterval(
      () => void checkActivity({ record: false }),
      CHECK_INTERVAL_MS
    )

    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, onActivity, { passive: true })
    )
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearInterval(interval)
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, onActivity))
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  return null
}
