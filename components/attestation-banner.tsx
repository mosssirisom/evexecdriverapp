'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { confirmAttestation } from '@/app/actions/attestation'
import type { Booking } from '@/lib/types'

const POLL_INTERVAL_MS = 15_000

function formatCountdown(deadline: string | null, now: number): string {
  if (!deadline) return ''
  const remainingMs = new Date(deadline).getTime() - now
  const remainingSec = Math.max(0, Math.floor(remainingMs / 1000))
  const mm = Math.floor(remainingSec / 60)
  const ss = remainingSec % 60
  return `${mm}:${ss.toString().padStart(2, '0')}`
}

/**
 * Urgent banner shown to a driver while a booking is awaiting attestation
 * (Zero-Failure Driver Attestation Loop). Polls independently of the rest
 * of the dashboard so it keeps working even if other queries fail, and
 * counts down to the next escalation gate in real time.
 */
export function AttestationBanner() {
  const [booking, setBooking] = useState<Booking | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('bookings')
      .select('*')
      .eq('assigned_driver_id', user.id)
      .in('attestation_status', ['awaiting_first_attestation', 'awaiting_second_attestation'])
      .order('attestation_first_deadline', { ascending: true })
      .limit(1)
      .maybeSingle()

    setBooking(data ?? null)
  }, [supabase])

  useEffect(() => {
    load()
    const dataInterval = setInterval(load, POLL_INTERVAL_MS)
    const tickInterval = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      clearInterval(dataInterval)
      clearInterval(tickInterval)
    }
  }, [load])

  if (!booking) return null

  const urgent = booking.attestation_status === 'awaiting_second_attestation'
  const deadline = urgent ? booking.attestation_second_deadline : booking.attestation_first_deadline
  const countdown = formatCountdown(deadline, now)

  const handleConfirm = async () => {
    setConfirming(true)
    setError(null)
    const result = await confirmAttestation(booking.id)
    if (result?.error) {
      setError(result.error)
      setConfirming(false)
      return
    }
    setBooking(null)
  }

  return (
    <div
      className="mb-5 rounded-2xl border p-4"
      style={{
        borderColor: urgent ? 'rgba(248,113,113,0.4)' : 'rgba(213,165,56,0.3)',
        background: urgent
          ? 'linear-gradient(135deg, rgba(248,113,113,0.18), rgba(248,113,113,0.05))'
          : 'linear-gradient(135deg, rgba(213,165,56,0.12), rgba(213,165,56,0.04))',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle size={16} className={urgent ? 'text-red-400' : 'text-[#d5a538]'} />
        <span className={`text-[10px] font-bold uppercase tracking-widest ${urgent ? 'text-red-400' : 'text-[#d5a538]'}`}>
          {urgent ? 'Urgent — confirm now' : 'Attestation required'}
        </span>
        {countdown && (
          <span className={`ml-auto text-xs font-mono font-semibold ${urgent ? 'text-red-300' : 'text-[#f1c56a]'}`}>
            {countdown}
          </span>
        )}
      </div>

      <p className="text-white font-semibold text-sm mb-1">{booking.customer_name}</p>
      <p className="text-white/50 text-xs mb-3">
        {booking.pickup_location ?? booking.airport ?? 'Pickup location'}
        {booking.travel_time ? ` — ${booking.travel_time}` : ''}
      </p>

      {urgent && (
        <p className="text-red-300 text-xs mb-3">
          You have not confirmed this pickup. If you don&apos;t confirm now, this job will be reassigned to another driver.
        </p>
      )}

      {error && <p className="text-red-400 text-xs mb-2">{error}</p>}

      <button
        onClick={handleConfirm}
        disabled={confirming}
        className="w-full py-3 rounded-xl font-semibold text-sm text-[#020813] disabled:opacity-50 transition-opacity"
        style={{ background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)' }}
      >
        {confirming ? 'Confirming…' : "I'm Ready — Confirm Now"}
      </button>
    </div>
  )
}
