'use client'

import { useEffect, useState } from 'react'
import { Plane } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

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
 * confirmed, including any mismatch/warning the operator saw.
 */
export function VerifiedFlightCard({ bookingId }: { bookingId: string }) {
  const [verification, setVerification] = useState<FlightVerification | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    async function load() {
      const { data } = await supabase
        .from('flight_verifications')
        .select('*')
        .eq('booking_id', bookingId)
        .order('verified_at', { ascending: false })
        .limit(1)
      if (cancelled) return
      setVerification((data?.[0] as FlightVerification) ?? null)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [bookingId])

  if (loading || !verification) return null

  const severityColor =
    verification.severity === 'green' ? '#16a34a' : verification.severity === 'amber' ? '#d97706' : '#dc2626'
  const relevantTime = verification.direction === 'arrival' ? verification.scheduled_arrival : verification.scheduled_departure

  return (
    <div className="bg-white border border-[#c4d4e4] rounded-2xl p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#7a9ab8] mb-3 flex items-center gap-1.5">
        <Plane size={11} /> Flight (verified)
      </p>
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
