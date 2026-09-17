'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plane, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from './toast'

interface FlightVerification {
  flight_number: string
  direction: 'arrival' | 'departure'
  departure_iata: string | null
  arrival_iata: string | null
  scheduled_arrival: string | null
  scheduled_departure: string | null
  recommended_pickup: string | null
  flight_status: string | null
  severity: 'green' | 'amber' | 'red'
  issues: string[]
  verified_at: string
}

function formatFlightDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const date = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/London' })
  return `${date}, ${time}`
}

/**
 * Shows the operator-verified flight data (via AeroDataBox), not the raw
 * flight number the customer typed -- the driver sees what was actually
 * confirmed, including any mismatch/warning the operator saw. The refresh
 * button lets the driver re-check status/landing time themselves rather
 * than waiting on the operator or the day-before cron.
 */
export function VerifiedFlightCard({ bookingId }: { bookingId: string }) {
  const [verification, setVerification] = useState<FlightVerification | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const { addToast } = useToast()

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('flight_verifications')
      .select('*')
      .eq('booking_id', bookingId)
      .order('verified_at', { ascending: false })
      .limit(1)
    setVerification((data?.[0] as FlightVerification) ?? null)
  }, [bookingId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await load()
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [load])

  const reVerify = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.functions.invoke('verify-flight', {
        body: { bookingId, source: 'manual' },
      })
      if (error) throw new Error(error.message || 'Verification request failed')
      if (!data?.ok) throw new Error(data?.error || 'Verification failed')
      setVerification(data.verification as FlightVerification)
    } catch (err) {
      addToast({
        title: 'Flight check failed',
        message: err instanceof Error ? err.message : 'Could not re-check the flight',
      })
    } finally {
      setRefreshing(false)
    }
  }, [bookingId, refreshing, addToast])

  if (loading) return null
  if (!verification) {
    return (
      <div className="bg-white border border-[#c4d4e4] rounded-2xl p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#7a9ab8] flex items-center gap-1.5">
            <Plane size={11} /> Flight (verified)
          </p>
          <button
            onClick={reVerify}
            disabled={refreshing}
            className="w-8 h-8 rounded-xl bg-[#dce8f2] flex items-center justify-center active:opacity-70 disabled:opacity-40 flex-shrink-0"
          >
            <RefreshCw size={13} className={`text-[#7a9ab8] ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <p className="text-[#7a9ab8] text-xs">Not yet verified. Tap refresh to check.</p>
      </div>
    )
  }

  const severityColor =
    verification.severity === 'green' ? '#16a34a' : verification.severity === 'amber' ? '#d97706' : '#dc2626'
  const relevantTime = verification.direction === 'arrival' ? verification.scheduled_arrival : verification.scheduled_departure

  return (
    <div className="bg-white border border-[#c4d4e4] rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#7a9ab8] flex items-center gap-1.5">
          <Plane size={11} /> Flight (verified)
        </p>
        <button
          onClick={reVerify}
          disabled={refreshing}
          className="w-8 h-8 rounded-xl bg-[#dce8f2] flex items-center justify-center active:opacity-70 disabled:opacity-40 flex-shrink-0"
        >
          <RefreshCw size={13} className={`text-[#7a9ab8] ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[#060C1A] text-base font-semibold">{verification.flight_number}</p>
        {(verification.departure_iata || verification.arrival_iata) && (
          <p className="text-[#7a9ab8] text-xs font-medium">
            {verification.departure_iata ?? '—'} → {verification.arrival_iata ?? '—'}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <p className="text-[#7a9ab8] text-[10px] uppercase tracking-wider mb-0.5">
            {verification.direction === 'arrival' ? 'Arrival' : 'Departure'}
          </p>
          <p className="text-[#060C1A] text-sm font-medium">{formatFlightDateTime(relevantTime)}</p>
        </div>
        {verification.recommended_pickup && (
          <div>
            <p className="text-[#7a9ab8] text-[10px] uppercase tracking-wider mb-0.5">Recommended pickup</p>
            <p className="text-[#060C1A] text-sm font-medium">{formatFlightDateTime(verification.recommended_pickup)}</p>
          </div>
        )}
      </div>
      {verification.flight_status && (
        <p className="text-[#7a9ab8] text-xs mb-2">
          Flight status: <span className="text-[#060C1A] font-medium">{verification.flight_status}</span>
        </p>
      )}
      {verification.issues?.length > 0 && (
        <div className="rounded-xl px-3 py-2 mt-2" style={{ background: `${severityColor}14`, border: `1px solid ${severityColor}33` }}>
          {verification.issues.map((issue, i) => (
            <p key={i} className="text-xs font-medium" style={{ color: severityColor }}>
              {issue}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
