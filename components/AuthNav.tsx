'use client'

import Link from './Link'
import { useAuth } from '@/lib/hooks/useAuth'

const authLinkClasses =
  'hidden whitespace-nowrap rounded-lg px-0.5 py-1.5 text-sm font-medium text-gray-600 transition-colors duration-150 ease-out-expo hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500 focus-visible:outline-offset-2 dark:text-gray-400 dark:hover:text-gray-100 xl:block'

export default function AuthNav() {
  const { isLoggedIn, logout } = useAuth()

  if (!isLoggedIn) {
    return (
      <Link
        href="/login"
        className="hidden items-center whitespace-nowrap rounded-full bg-primary-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_6px_16px_-4px_rgba(249,115,22,0.4)] transition-all duration-150 ease-out-expo hover:-translate-y-px hover:bg-primary-600 hover:shadow-[0_8px_20px_-4px_rgba(249,115,22,0.5)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500 focus-visible:outline-offset-2 active:scale-[0.97] xl:inline-flex"
      >
        Login
      </Link>
    )
  }

  return (
    <>
      <Link href="/admin" className={authLinkClasses}>
        Admin
      </Link>
      <button onClick={logout} className={authLinkClasses}>
        Logout
      </button>
    </>
  )
}
