import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isIdle, LAST_ACTIVE_COOKIE, lastActiveAt, SESSION_IDLE_REASON } from './session'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
          if (headers) {
            Object.entries(headers).forEach(([key, value]) => {
              supabaseResponse.headers.set(key, value)
            })
          }
        },
      },
    }
  )

  // Do not add logic between createServerClient and getClaims(). Like getUser(), it refreshes an
  // expired access token first, which is what keeps the session cookies current; unlike getUser()
  // it also returns the token's claims, which the inactivity check needs.
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims ?? null

  // Middleware only checks activity, it never records it. Recording is left to IdleSessionGuard,
  // which sees real interactions -- a request reaching here can be a router prefetch the user never
  // asked for, and counting those would keep an unattended tab signed in.
  if (claims && isIdle(lastActiveAt(request.cookies.get(LAST_ACTIVE_COOKIE)?.value, claims))) {
    // Revoke the session with Supabase rather than only dropping it locally, so its refresh token
    // stops working even if a copy of the cookie survives somewhere. `local` ends just this session;
    // other devices are judged on their own activity. SIGNED_OUT makes the client write the cookie
    // deletions through `setAll` above.
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) {
      // A failed revocation (network blip, Supabase 5xx) leaves the session in place and writes no
      // cookie deletions, so this browser would stay signed in and hit this branch again on every
      // request. Drop the cookies ourselves: the refresh token stays valid server-side until it
      // expires, but nothing here holds a copy of it any more.
      console.error('Failed to revoke idle session:', error)
      clearAuthCookies(request, supabaseResponse)
    }
    return redirectToLogin(request, supabaseResponse, SESSION_IDLE_REASON)
  }

  // Protect /admin routes: redirect unauthenticated users to /login. The root middleware.ts matcher
  // only runs this for /admin paths, so every request here is one.
  if (!claims) {
    return redirectToLogin(request, supabaseResponse)
  }

  return supabaseResponse
}

// Supabase stores the session as `sb-<project-ref>-auth-token`, split into `.0`, `.1`, ... chunks
// when it's large, all at path `/`.
const AUTH_COOKIE_PATTERN = /^sb-.+-auth-token(\.\d+)?$/

function clearAuthCookies(request: NextRequest, response: NextResponse) {
  request.cookies
    .getAll()
    .filter(({ name }) => AUTH_COOKIE_PATTERN.test(name))
    .forEach(({ name }) => response.cookies.set(name, '', { path: '/', maxAge: 0 }))
}

function redirectToLogin(request: NextRequest, sessionResponse: NextResponse, reason?: string) {
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.searchParams.set('redirectTo', request.nextUrl.pathname)
  if (reason) url.searchParams.set('reason', reason)

  // A redirect is a fresh response, so it doesn't carry the cookie writes Supabase just made on
  // `sessionResponse` -- including the deletions from signing out. Without copying them across,
  // the browser would keep the dead session's cookies.
  const redirect = NextResponse.redirect(url)
  sessionResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
  return redirect
}
