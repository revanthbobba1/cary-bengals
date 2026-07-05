'use client'

import Link from './Link'
import { useAuth } from '@/lib/hooks/useAuth'

export default function AuthNav() {
  const { isLoggedIn, logout } = useAuth()

  if (!isLoggedIn) {
    return (
      <Link href="/login" className="hidden sm:block font-medium text-gray-900 dark:text-gray-100">
        Login
      </Link>
    )
  }

  return (
    <>
      <Link href="/admin" className="hidden sm:block font-medium text-gray-900 dark:text-gray-100">
        Admin
      </Link>
      <button
        onClick={logout}
        className="hidden sm:block font-medium text-gray-900 dark:text-gray-100"
      >
        Logout
      </button>
    </>
  )
}
