'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [isPending, setIsPending] = useState(false)

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setIsPending(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })

    setIsPending(false)
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-[#f8fafc]">
      <div className="mb-8 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="EV Exec" width={160} height={160} className="mx-auto" />
        <p className="text-gray-400 mt-2 tracking-widest uppercase text-xs">Driver Portal</p>
      </div>

      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl p-6 shadow-2xl">
        {sent ? (
          <div className="text-center py-2">
            <MailCheck size={32} className="mx-auto mb-3 text-[#d5a538]" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Check your email</h2>
            <p className="text-gray-500 text-sm">
              If an account exists for <span className="text-gray-700">{email}</span>, we&apos;ve sent a link to reset your password.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-[#d5a538] text-xs font-medium mt-6"
            >
              <ArrowLeft size={14} />
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Reset your password</h2>
            <p className="text-gray-400 text-sm mb-6">
              Enter the email associated with your driver account and we&apos;ll send you a link to reset your password.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 mb-2 uppercase tracking-widest">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@evexec.co.uk"
                  className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-[#d5a538] focus:ring-1 focus:ring-[#d5a538] transition-colors"
                />
              </div>

              {error && (
                <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="w-full py-3.5 rounded-xl font-semibold text-[#020813] text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity mt-2"
                style={{ background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)' }}
              >
                {isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                {isPending ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>

            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-500 text-xs font-medium mt-6"
            >
              <ArrowLeft size={14} />
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
