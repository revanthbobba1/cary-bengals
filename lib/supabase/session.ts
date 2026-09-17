/**
 * App-enforced inactivity timeout for sign-ins.
 *
 * Supabase keeps sessions alive indefinitely by default: auth cookies are written with a 400-day
 * max-age and every page load refreshes the session and rewrites them, so anyone who visits now and
 * then stays signed in forever. The fixes Supabase offers don't fit: its time-boxed sessions and
 * inactivity timeout are Pro-plan only, and that inactivity timeout counts token *refreshes*, which
 * the browser client performs on a timer while a tab is open -- a tab left open unattended never
 * looks inactive to it. Shortening the cookie max-age doesn't work either, since @supabase/ssr forces
 * its 400-day default back on every cookie write.
 *
 * So the app tracks actual use instead. `IdleSessionGuard` stamps the time of the user's last
 * interaction into the `cb-last-active` cookie, and the session is ended once that is more than
 * `IDLE_TIMEOUT_SECONDS` old -- checked by middleware and the admin layout before any /admin page
 * renders, and by the guard itself so an open tab signs out on its own.
 *
 * This is hygiene for the browser that signed in, not a hard security boundary. The cookie is
 * readable and writable by the page (it has to be, for the guard to update it), so a user can only
 * ever use that to extend their *own* session; and a refresh token lifted from a device and used
 * against Supabase directly never passes through these checks at all.
 *
 * Timestamps are written by the browser's clock and read by the server's, which assumes clocks agree
 * to well within the timeout. An ordinary NTP-synced device is off by seconds, against a 4-hour limit.
 */

export const IDLE_TIMEOUT_SECONDS = 4 * 60 * 60

/** The timeout as people read it: "4 hours", "90 minutes", "1 hour". */
export function describeDuration(seconds: number): string {
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  }
  const minutes = Math.round(seconds / 60)
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
}

/** Unix seconds of the user's last interaction with the site. Not a secret; see above. */
export const LAST_ACTIVE_COOKIE = 'cb-last-active'

/** `?reason=` value the login page uses to explain why the user was sent back to it. */
export const SESSION_IDLE_REASON = 'session_idle'

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

// Structural rather than importing `JwtPayload` from auth-js, which supabase-js doesn't re-export.
// The typed `amr` is `AMREntry[] | string[]`; only the object form carries a timestamp.
interface ClaimsWithAmr {
  amr?: ReadonlyArray<{ timestamp?: unknown } | string>
}

/**
 * When the user last authenticated in this session, in Unix seconds, or null if the token doesn't
 * say. Supabase Auth records this per session at sign-in and replays it unchanged on refresh.
 */
export function authenticatedAt(claims: ClaimsWithAmr): number | null {
  const timestamps = (claims.amr ?? []).flatMap((entry) =>
    typeof entry === 'object' && typeof entry.timestamp === 'number' ? [entry.timestamp] : []
  )
  return timestamps.length > 0 ? Math.max(...timestamps) : null
}

/**
 * The most recent sign of life for this session: the later of the last recorded interaction and the
 * sign-in itself.
 *
 * Counting the sign-in is what makes signing in reset the clock. The activity cookie outlives any
 * one session, so after an idle sign-out it still holds that stale timestamp; judged on the cookie
 * alone, the next sign-in would be ruled idle and signed straight back out, in a loop. It also
 * gives sessions that predate this cookie a starting point.
 */
export function lastActiveAt(
  cookieValue: string | undefined,
  claims: ClaimsWithAmr
): number | null {
  const recorded = Number(cookieValue)
  const candidates = [
    Number.isFinite(recorded) && recorded > 0 ? recorded : null,
    authenticatedAt(claims),
  ].filter((t): t is number => t !== null)
  return candidates.length > 0 ? Math.max(...candidates) : null
}

/**
 * Whether the session has gone unused for longer than `IDLE_TIMEOUT_SECONDS`.
 *
 * Deliberately false when there's no timestamp to judge by. Failing closed instead would lock
 * everyone out if the token ever stopped carrying one: every fresh sign-in would be ruled idle too.
 */
export function isIdle(lastActive: number | null, now: number = nowSeconds()): boolean {
  return lastActive !== null && now - lastActive > IDLE_TIMEOUT_SECONDS
}
