'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthListener() {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const hash = window.location.hash.substring(1)
    if (!hash || !hash.includes('access_token')) return

    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const type = params.get('type')

    if (!accessToken || !refreshToken) return

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) return

        window.history.replaceState(null, '', window.location.pathname)

        if (type === 'invite') {
          router.push('/set-password')
        } else {
          router.push('/admin')
        }
        router.refresh()
      })
  }, [])

  return null
}
