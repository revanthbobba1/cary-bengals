'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from './Link'
import { useRouter } from 'next/navigation'

export default function AuthNav() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsLoggedIn(!!user)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session?.user)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  if (!isLoggedIn) {
    return (
      <Link
        href="/login"
        className="hidden sm:block font-medium text-gray-900 dark:text-gray-100"
      >
        Login
      </Link>
    )
  }

  return (
    <>
      <Link
        href="/admin"
        className="hidden sm:block font-medium text-gray-900 dark:text-gray-100"
      >
        Admin
      </Link>
      <button
        onClick={handleLogout}
        className="hidden sm:block font-medium text-gray-900 dark:text-gray-100"
      >
        Logout
      </button>
    </>
  )
}
