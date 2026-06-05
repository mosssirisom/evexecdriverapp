'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { login } from '@/app/actions/auth'
import { LOGIN_EMAIL_PLACEHOLDER } from '@/lib/config'

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
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-[#020813]">
      {/* Logo */}
      <div className="mb-8 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="EV Exec"
          width={160}
          height={160}
          className="mx-auto"
        />
        <p className="text-white/40 mt-2 tracking-widest uppercase text-xs">Driver Portal</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-[#0B1525] border border-white/8 rounded-2xl p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-6">Sign in</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-semibold text-white/40 mb-2 uppercase tracking-widest">
              Email
            </label>
            <input
              type="email"
              name="email"
              required
              placeholder={LOGIN_EMAIL_PLACEHOLDER}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-[#d5a538] focus:ring-1 focus:ring-[#d5a538] transition-colors"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-white/40 mb-2 uppercase tracking-widest">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                required
                placeholder="••••••••"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-12 text-white placeholder-white/20 text-sm focus:outline-none focus:border-[#d5a538] focus:ring-1 focus:ring-[#d5a538] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
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
            {isPending ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-white/20 mt-6">
          Account access is managed by EV Exec
        </p>
      </div>
    </div>
  )
}
