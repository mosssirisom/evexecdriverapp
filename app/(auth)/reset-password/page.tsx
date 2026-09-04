'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [ready, setReady] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setError('This password reset link is invalid or has expired. Please request a new one.')
      }
      setReady(true)
    })
  }, [supabase])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsPending(true)
    const { error } = await supabase.auth.updateUser({ password })
    setIsPending(false)

    if (error) {
      setError(error.message)
    } else {
      setSuccess(true)
      setTimeout(() => {
        router.push('/dashboard')
        router.refresh()
      }, 1500)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-[#eaeff7]">
      <div className="mb-8 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="EV Exec" width={160} height={160} className="mx-auto" />
        <p className="text-[#7a9ab8] mt-2 tracking-widest uppercase text-xs">Driver Portal</p>
      </div>

      <div className="w-full max-w-sm bg-white border border-[#c4d4e4] rounded-2xl p-6 shadow-2xl">
        {success ? (
          <div className="text-center py-2">
            <CheckCircle2 size={32} className="mx-auto mb-3 text-green-400" />
            <h2 className="text-lg font-semibold text-[#060C1A] mb-2">Password updated</h2>
            <p className="text-[#4a6a8a] text-sm">Taking you to your dashboard…</p>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-[#060C1A] mb-6">Set a new password</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-[#7a9ab8] mb-2 uppercase tracking-widest">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#dce8f2] border border-[#c4d4e4] rounded-xl px-4 py-3 pr-12 text-[#060C1A] placeholder-[#7a9ab8] text-sm focus:outline-none focus:border-[#d5a538] focus:ring-1 focus:ring-[#d5a538] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7a9ab8] hover:text-[#4a6a8a] transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-[#7a9ab8] mb-2 uppercase tracking-widest">
                  Confirm Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#dce8f2] border border-[#c4d4e4] rounded-xl px-4 py-3 text-[#060C1A] placeholder-[#7a9ab8] text-sm focus:outline-none focus:border-[#d5a538] focus:ring-1 focus:ring-[#d5a538] transition-colors"
                />
              </div>

              {error && (
                <div className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2 space-y-1">
                  <p>{error}</p>
                  {!ready ? null : (
                    <Link href="/forgot-password" className="underline inline-block">
                      Request a new link
                    </Link>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={isPending || !ready}
                className="w-full py-3.5 rounded-xl font-semibold text-[#020813] text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity mt-2"
                style={{ background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)' }}
              >
                {isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                {isPending ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
