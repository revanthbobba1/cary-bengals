'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from './Link'
import headerNavLinks from '@/data/headerNavLinks'
import { useAuth } from '@/lib/hooks/useAuth'
import { focusRingClasses } from '@/lib/focusRing'

const MobileNav = () => {
  const [navShow, setNavShow] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { isLoggedIn, logout } = useAuth()

  useEffect(() => setMounted(true), [])

  const onToggleNav = () => {
    setNavShow((status) => {
      if (status) {
        document.body.style.overflow = 'auto'
      } else {
        document.body.style.overflow = 'hidden'
      }
      return !status
    })
  }

  const handleLogout = async () => {
    onToggleNav()
    await logout()
  }

  const linkClasses = `inline-block rounded text-2xl font-bold tracking-tight text-ink transition-all duration-300 ease-out-expo hover:text-primary-500 ${focusRingClasses} active:scale-[0.97] dark:text-gray-100 dark:hover:text-primary-400`

  // Portaled to <body> — a sheet nested inside the header would have its `fixed` positioning
  // confined to the header's own box, since the header's `backdrop-blur` creates a new
  // containing block for fixed descendants (a CSS gotcha, not a typo).
  const sheet = (
    <div
      className={`fixed left-0 top-0 z-50 h-full w-full transform bg-white/[0.98] backdrop-blur-md duration-300 ease-out-expo dark:bg-gray-950/[0.98] ${
        navShow ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="flex justify-end">
        <button
          className={`mr-8 mt-11 flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition-transform duration-150 ease-out-expo ${focusRingClasses} active:scale-90 dark:text-gray-400`}
          aria-label="Toggle Menu"
          onClick={onToggleNav}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-6 w-6"
          >
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
      <nav className="fixed mt-8 h-full">
        {headerNavLinks.map((link, index) => (
          <div
            key={link.title}
            className={`px-12 py-4 transition-all duration-300 ease-out-expo ${
              navShow ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'
            }`}
            style={{ transitionDelay: navShow ? `${50 + index * 50}ms` : '0ms' }}
          >
            <Link href={link.href} className={linkClasses} onClick={onToggleNav}>
              {link.title}
            </Link>
          </div>
        ))}
        {isLoggedIn && (
          <div
            className={`px-12 py-4 transition-all duration-300 ease-out-expo ${
              navShow ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'
            }`}
            style={{ transitionDelay: navShow ? `${50 + headerNavLinks.length * 50}ms` : '0ms' }}
          >
            <Link href="/admin" className={linkClasses} onClick={onToggleNav}>
              Admin
            </Link>
          </div>
        )}
        {isLoggedIn ? (
          <div
            className={`px-12 py-4 transition-all duration-300 ease-out-expo ${
              navShow ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'
            }`}
            style={{
              transitionDelay: navShow ? `${50 + (headerNavLinks.length + 1) * 50}ms` : '0ms',
            }}
          >
            <button onClick={handleLogout} className={linkClasses}>
              Logout
            </button>
          </div>
        ) : (
          <div
            className={`mx-12 mt-5 border-t border-gray-200 pt-5 transition-opacity duration-300 ease-out-expo dark:border-gray-800 ${
              navShow ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              transitionDelay: navShow ? `${50 + headerNavLinks.length * 50 + 20}ms` : '0ms',
            }}
          >
            <Link
              href="/login"
              className={`inline-flex items-center rounded-full bg-primary-500 px-7 py-3.5 text-lg font-semibold text-white shadow-[0_8px_20px_-4px_rgba(249,115,22,0.4)] transition-all duration-150 ease-out-expo hover:-translate-y-px hover:bg-primary-600 ${focusRingClasses} active:scale-[0.97]`}
              onClick={onToggleNav}
            >
              Login
            </Link>
          </div>
        )}
      </nav>
    </div>
  )

  return (
    <>
      <button
        aria-label="Toggle Menu"
        onClick={onToggleNav}
        className={`flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition-transform duration-150 ease-out-expo ${focusRingClasses} active:scale-90 dark:text-gray-400 xl:hidden`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-7 w-7"
        >
          <path
            fillRule="evenodd"
            d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {mounted && createPortal(sheet, document.body)}
    </>
  )
}

export default MobileNav
