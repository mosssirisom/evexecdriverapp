'use client'

import { useEffect, useState } from 'react'
import { BellRing } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { enablePush, pushState, sendTestPush, syncPush, type PushState } from '@/lib/push'

const LABEL: Record<PushState, string> = {
  on: 'On',
  off: 'Off',
  denied: 'Blocked',
  'needs-install': 'Add to Home Screen first',
  unsupported: 'Not supported on this browser',
}

/** Profile card: notification status, turn on, and a test send to this driver's own phone. */
export function PushSettings() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => { setState(pushState()) }, [])

  const userId = async () => (await createClient().auth.getUser()).data.user?.id ?? null

  const turnOn = async () => {
    setBusy(true); setMessage(null)
    try {
      const id = await userId()
      if (id) setState(await enablePush(id))
    } catch {
      setMessage('Could not turn on notifications. Please try again.')
      setState(pushState())
    } finally { setBusy(false) }
  }

  const test = async () => {
    setBusy(true); setMessage(null)
    try {
      const id = await userId()
      if (id) await syncPush(id)
      const r = await sendTestPush()
      setMessage(r.sent > 0
        ? 'Test sent. Lock your phone: it should arrive within a few seconds.'
        : 'No phone could be reached. Tap "Turn on notifications" again.')
    } catch {
      setMessage('Could not send a test. Please try again.')
    } finally { setBusy(false) }
  }

  if (!state) return null

  return (
    <div className="bg-white border border-[#c4d4e4] rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BellRing size={14} className="text-[#d5a538]" />
          <p className="text-[#4a6a8a] text-xs font-semibold uppercase tracking-widest">Job notifications</p>
        </div>
        <span className={`text-xs font-bold ${state === 'on' ? 'text-green-600' : 'text-[#b45309]'}`}>{LABEL[state]}</span>
      </div>

      {state === 'needs-install' && (
        <p className="text-[#4a6a8a] text-sm mt-3">In Safari tap Share, then &ldquo;Add to Home Screen&rdquo;, and open EV Exec from the Home Screen.</p>
      )}
      {state === 'denied' && (
        <p className="text-[#4a6a8a] text-sm mt-3">Turn them on in your phone&rsquo;s Settings › Notifications › EV Exec.</p>
      )}

      {state === 'off' && (
        <button onClick={turnOn} disabled={busy}
          className="mt-3 w-full py-2.5 rounded-xl bg-[#d5a538] text-[#020813] text-sm font-bold active:opacity-80 disabled:opacity-60">
          {busy ? 'Turning on…' : 'Turn on notifications'}
        </button>
      )}
      {state === 'on' && (
        <button onClick={test} disabled={busy}
          className="mt-3 w-full py-2.5 rounded-xl border border-[#c4d4e4] text-[#1e3a5f] text-sm font-semibold active:bg-[#dce8f2] disabled:opacity-60">
          {busy ? 'Sending…' : 'Send test notification'}
        </button>
      )}
      {message && <p className="text-[#4a6a8a] text-xs mt-2">{message}</p>}
    </div>
  )
}
