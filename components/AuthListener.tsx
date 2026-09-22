'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthListener() {
  const router = useRouter()
  const supabase = createClient()
  const cancelled = useRef(false)

  useEffect(() => {
    cancelled.current = false
    const hash = window.location.hash.substring(1)
    if (!hash) return

    const params = new URLSearchParams(hash)

    // A failed /verify -- most commonly an invite or magic-link token an email security scanner
    // already consumed by prefetching the link before the real click -- redirects here with an
    // error instead of tokens. /login already surfaces this itself from its own hash, so leave
    // that path alone rather than race it to clear the same hash. Anywhere else (this component
    // is mounted for every page, since invite/magic links redirect to the bare site origin, not
    // to a specific route) nothing was handling this at all, so it looked like a dead click: the
    // user just lands on a normal, unexplained page.
    if (params.has('error')) {
      if (window.location.pathname === '/login') return
      window.history.replaceState(null, '', window.location.pathname)
      router.push('/login?error=auth_failed')
      return
    }

    if (!params.has('access_token')) return

    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const type = params.get('type')

    if (!accessToken || !refreshToken) return

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error || cancelled.current) return

        window.history.replaceState(null, '', window.location.pathname)

        if (type === 'invite') {
          router.push('/set-password')
        } else {
          router.push('/admin')
        }
        router.refresh()
      })

    return () => {
      cancelled.current = true
    }
  }, [])

  return null
}
