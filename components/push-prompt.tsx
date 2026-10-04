'use client'

import { useEffect, useState } from 'react'
import { BellRing, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { enablePush, pushState, type PushState } from '@/lib/push'

const HIDE_KEY = 'evexec_push_prompt_hidden'

/** Banner shown until job notifications are switched on for this phone. */
export function PushPrompt() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    setState(pushState())
    try { setHidden(sessionStorage.getItem(HIDE_KEY) === '1') } catch { /* private mode */ }
  }, [])

  if (hidden || !state || state === 'on' || state === 'unsupported') return null

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
    ? 'To get job alerts, tap Share then "Add to Home Screen", and open EV Exec from there.'
    : state === 'denied'
      ? 'Notifications are blocked. Turn them on in Settings › Notifications › EV Exec.'
      : 'Turn on notifications so you get new jobs and changes straight away.'

  return (
    <div className="mx-4 mt-3 mb-1 bg-[#020813] text-white rounded-2xl p-4 flex items-start gap-3">
      <BellRing size={18} className="text-[#d5a538] mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug">{text}</p>
        {state === 'off' && (
          <button
            onClick={turnOn}
            disabled={busy}
            className="mt-3 px-4 py-2 rounded-xl bg-[#d5a538] text-[#020813] text-sm font-bold active:opacity-80 disabled:opacity-60"
          >
            {busy ? 'Turning on…' : 'Turn on notifications'}
          </button>
        )}
      </div>
      <button onClick={hide} aria-label="Hide" className="p-1 -m-1 text-white/50">
        <X size={16} />
      </button>
    </div>
  )
}
