import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function safeRedirectPath(redirectTo: string | null): string {
  if (
    redirectTo &&
    redirectTo.startsWith('/') &&
    !redirectTo.startsWith('//') &&
    !redirectTo.includes('@')
  ) {
    return redirectTo
  }
  return '/admin'
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const redirectTo = safeRedirectPath(searchParams.get('redirectTo'))

  if (code) {
    const supabase = createClient()
    const { error, data } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const isNewUser = data.user?.user_metadata?.email_verified && !data.user?.last_sign_in_at
      if (isNewUser) {
        return NextResponse.redirect(`${origin}/set-password`)
      }
      return NextResponse.redirect(`${origin}${redirectTo}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
