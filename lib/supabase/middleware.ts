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
  const isAdminRoute = request.nextUrl.pathname.startsWith('/admin')

  // Middleware only checks activity, it never records it. Recording is left to IdleSessionGuard,
  // which sees real interactions -- a request reaching here can be a router prefetch the user never
  // asked for, and counting those would keep an unattended tab signed in.
  if (claims && isIdle(lastActiveAt(request.cookies.get(LAST_ACTIVE_COOKIE)?.value, claims))) {
    // Revoke the session with Supabase rather than only dropping it locally, so its refresh token
    // stops working even if a copy of the cookie survives somewhere. `local` ends just this session;
    // other devices are judged on their own activity. SIGNED_OUT makes the client write the cookie
    // deletions through `setAll` above.
    await supabase.auth.signOut({ scope: 'local' })
    return isAdminRoute
      ? redirectToLogin(request, supabaseResponse, SESSION_IDLE_REASON)
      : supabaseResponse
  }

  // Protect /admin routes: redirect unauthenticated users to /login
  if (!claims && isAdminRoute) {
    return redirectToLogin(request, supabaseResponse)
  }

  return supabaseResponse
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
