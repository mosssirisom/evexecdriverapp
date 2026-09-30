'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, Mail, Lock } from 'lucide-react'
import { login } from '@/app/actions/auth'
import { LOGIN_EMAIL_PLACEHOLDER } from '@/lib/config'

const inputCls =
  'w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-gold/40 transition-colors'

export default function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await login(formData)
      if (result?.error) {
        setError(result.error)
      } else {
        router.push('/dashboard')
        router.refresh()
      }
    })
  }

  return (
    <div className="min-h-screen bg-[#020813] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="EV Exec"
            width={260}
            style={{ maxWidth: '260px', objectFit: 'contain' }}
          />
          <p
            className="text-white/50 font-medium uppercase mt-1 tracking-widest"
            style={{ fontSize: 'clamp(0.6rem, 1.5vw, 0.7rem)', letterSpacing: '0.22em' }}
          >
            Driver Portal
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 bg-white shadow-[0_4px_20px_rgba(15,27,51,0.08)] p-6 space-y-4"
        >
          <h2 className="text-[#0F1B33] text-xl font-bold">Sign in</h2>

          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <Mail size={11} className="text-amber-600/80" />
              Email
            </label>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder={LOGIN_EMAIL_PLACEHOLDER}
              className={inputCls}
            />
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <Lock size={11} className="text-amber-600/80" />
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className={inputCls + ' pr-10'}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div className="flex justify-end">
              <Link href="/forgot-password" className="text-xs text-amber-600 hover:text-amber-600 transition-colors">
                Forgot password?
              </Link>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-100 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-3 rounded-2xl text-sm font-semibold text-[#020813] hover:opacity-90 active:scale-[0.98] disabled:opacity-60 transition-all flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)' }}
          >
            {isPending ? <Loader2 size={16} className="animate-spin" /> : null}
            {isPending ? 'Signing in…' : 'Sign In'}
          </button>

          <p className="text-center text-xs text-slate-600">
            Account access is managed by EV Exec
          </p>
        </form>
      </div>
    </div>
  )
}
