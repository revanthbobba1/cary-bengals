'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { inputClasses, labelClasses } from '@/lib/authFormClasses'
import { focusRingClasses } from '@/lib/focusRing'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    // Always show the same generic confirmation regardless of outcome -- Supabase itself
    // doesn't reveal whether the email belongs to an account, and we don't want to either.
    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent('/set-password')}`,
      })
    } catch {
      // Ignored -- see comment above.
    }

    setSubmitted(true)
    setLoading(false)
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-card border border-gray-200 bg-white p-8 shadow-card dark:border-gray-800 dark:bg-gray-900 dark:shadow-card-dark">
        <div className="space-y-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-ink dark:text-gray-100">
              Reset Your Password
            </h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Enter your email and we&apos;ll send you a link to reset your password
            </p>
          </div>

          {submitted ? (
            <div
              role="status"
              className="rounded-control bg-gray-100 p-4 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              If an account exists for that email, we&apos;ve sent a password reset link. Open it in
              this browser to continue.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
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

              <button
                type="submit"
                disabled={loading}
                className={`w-full rounded-full bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_6px_16px_-4px_rgba(249,115,22,0.4)] transition-all duration-150 ease-out-expo hover:-translate-y-px hover:bg-primary-600 hover:shadow-[0_8px_20px_-4px_rgba(249,115,22,0.5)] ${focusRingClasses} active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50`}
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
          )}

          <div className="text-center">
            <Link
              href="/login"
              className={`text-sm text-primary-600 hover:underline ${focusRingClasses}`}
            >
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
