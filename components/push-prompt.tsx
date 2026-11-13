'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { BellRing, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { enablePush, pushState, type PushState } from '@/lib/push'
import { BRAND } from '@/lib/brand'

const HIDE_KEY = 'evexec_push_prompt_hidden'

/** Banner shown until job notifications are switched on for this phone. */
export function PushPrompt() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [hidden, setHidden] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setState(pushState())
    try { setHidden(sessionStorage.getItem(HIDE_KEY) === '1') } catch { /* private mode */ }
  }, [])

  // Never in the way on a job: the driver needs the whole screen there.
  const onJob = /^\/jobs\/[^/]+/.test(pathname || '')
  if (hidden || onJob || !state || state === 'on' || state === 'unsupported') return null

  const turnOn = async () => {
    setBusy(true)
    try {
      const { data: { user } } = await createClient().auth.getUser()
      if (user) setState(await enablePush(user.id))
    } catch {
      setState(pushState())
    } finally {
      setBusy(false)
    }
  }

  const hide = () => {
    setHidden(true)
    try { sessionStorage.setItem(HIDE_KEY, '1') } catch { /* private mode */ }
  }

  const text = state === 'needs-install'
    ? 'To get job alerts, tap Share then "Add to Home Screen", and open ' + BRAND.name + ' from there.'
    : state === 'denied'
      ? 'Notifications are blocked. Turn them on in Settings › Notifications › ' + BRAND.name + '.'
      : 'Turn on notifications so you get new jobs and changes straight away.'

  return (
    <div className="mx-4 mt-3 mb-1 bg-[#020813] text-white rounded-2xl px-3.5 py-3 flex items-center gap-3">
      <BellRing size={18} className="text-[#d5a538] flex-shrink-0" />
      <p className="flex-1 min-w-0 text-[13px] leading-snug">{text}</p>
      {state === 'off' && (
        <button
          onClick={turnOn}
          disabled={busy}
          className="flex-shrink-0 px-3.5 min-h-[40px] rounded-xl bg-[#d5a538] text-[#020813] text-sm font-bold active:opacity-80 disabled:opacity-60"
        >
          {busy ? 'Turning on…' : 'Turn on'}
        </button>
      )}
      <button onClick={hide} aria-label="Hide" className="flex-shrink-0 flex items-center justify-center w-10 h-10 -mr-2 text-white/50">
        <X size={16} />
      </button>
    </div>
  )
}
