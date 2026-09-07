'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { inputClasses, labelClasses } from '@/lib/authFormClasses'
import { focusRingClasses } from '@/lib/focusRing'

function safeRedirectPath(value: string | null): string {
  if (value && value.startsWith('/') && !value.startsWith('//') && !value.includes('@')) {
    return value
  }
  return '/admin'
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const redirectTo = safeRedirectPath(searchParams.get('redirectTo'))

  useEffect(() => {
    // Supabase rejects some OAuth failures (e.g. a blocked signup) before ever
    // reaching our server-side callback route, and reports them via a URL hash
    // fragment instead of a query param since it's a client-side-only redirect.
    const hashError = new URLSearchParams(window.location.hash.slice(1)).get('error')
    const queryError = searchParams.get('error')

    if (hashError || queryError) {
      setError('Unable to sign in with that account')
      // Rewrite the URL bar directly instead of router.replace(): the Next.js
      // router treats a query-string change as a real navigation and remounts
      // this component, wiping the error state we just set.
      const url = new URL(window.location.href)
      url.hash = ''
      url.searchParams.delete('error')
      window.history.replaceState(null, '', url.pathname + url.search)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError('Invalid email or password')
      setLoading(false)
      return
    }

    router.push(redirectTo)
    router.refresh()
  }

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
      },
    })

    if (error) {
      setError('Failed to sign in with Google')
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-card border border-gray-200 bg-white p-8 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark">
        <div className="space-y-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-ink dark:text-gray-100">
              League Login
            </h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Sign in to access the admin dashboard
            </p>
          </div>

          {error && (
            <div className="rounded-control bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label htmlFor="email" className={labelClasses}>
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClasses}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className={labelClasses}>
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClasses}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full rounded-full bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_6px_16px_-4px_rgba(249,115,22,0.4)] transition-all duration-150 ease-out-expo hover:-translate-y-px hover:bg-primary-600 hover:shadow-[0_8px_20px_-4px_rgba(249,115,22,0.5)] ${focusRingClasses} active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50`}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-800" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-2 text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                Or continue with
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            className={`flex w-full items-center justify-center gap-3 rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-card transition-all duration-150 ease-out-expo hover:-translate-y-px hover:shadow-raised ${focusRingClasses} active:scale-[0.98] dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:shadow-card-dark dark:hover:shadow-raised-dark`}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
