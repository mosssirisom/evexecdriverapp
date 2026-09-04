// Flight Tracker Edge Function
//
// Queries the FlightAware AeroAPI v4 for live flight status and caches the
// result on the booking row (flight_status + flight_checked_at).
//
// Invoked by the driver app client when viewing an Arrived or En Route booking
// that has a flight_number. Caches results for 60 s to avoid redundant calls.
//
// Required secrets (set via: supabase secrets set KEY=value):
//   FLIGHTAWARE_API_KEY — AeroAPI v4 key from https://flightaware.com/aeroapi/
//
// POST body: { bookingId: string }
// Returns:   { ok: boolean; data?: FlightData; cached?: boolean; error?: string }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { CORS_HEADERS, corsPreflightResponse } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const FLIGHTAWARE_API_KEY = Deno.env.get('FLIGHTAWARE_API_KEY') ?? ''

const CACHE_TTL_MS = 60_000 // 60-second cache

interface FlightData {
  status: 'Scheduled' | 'En Route' | 'Landed' | 'Cancelled' | 'Diverted' | 'Unknown'
  origin: string | null
  destination: string | null
  scheduled_arrival: string | null
  estimated_arrival: string | null
  actual_arrival: string | null
  gate: string | null
  baggage_claim: string | null
  delay_minutes: number | null
  tail_number: string | null
  aircraft_type: string | null
}

function mapStatus(raw: string): FlightData['status'] {
  const s = raw.toLowerCase()
  if (s.includes('en route') || s === 'active') return 'En Route'
  if (s === 'landed' || s === 'arrived') return 'Landed'
  if (s === 'cancelled') return 'Cancelled'
  if (s === 'diverted') return 'Diverted'
  if (s === 'scheduled') return 'Scheduled'
  return 'Unknown'
}

async function fetchFromFlightAware(flightNumber: string): Promise<FlightData | null> {
  if (!FLIGHTAWARE_API_KEY) return null

  const ident = flightNumber.replace(/\s+/g, '').toUpperCase()
  const url = `https://aeroapi.flightaware.com/aeroapi/flights/${ident}?max_pages=1`

  const res = await fetch(url, {
    headers: { 'x-apikey': FLIGHTAWARE_API_KEY },
  })

  if (!res.ok) {
    console.error(`[track-flight] FlightAware ${res.status} for ${ident}`)
    return null
  }

  const json = await res.json()
  const flights: Record<string, unknown>[] = json.flights ?? []

  if (flights.length === 0) return null

  // Use the most recent flight entry
  const f = flights[0]

  const arrival = (f.destination as Record<string, unknown>) ?? {}

  return {
    status:             mapStatus(String(f.status ?? '')),
    origin:             String((f.origin as Record<string, unknown>)?.code ?? '') || null,
    destination:        String(arrival.code ?? '') || null,
    scheduled_arrival:  (f.scheduled_in as string | null) ?? null,
    estimated_arrival:  (f.estimated_in as string | null) ?? null,
    actual_arrival:     (f.actual_in as string | null) ?? null,
    gate:               String(arrival.gate ?? '') || null,
    baggage_claim:      String(arrival.baggage_claim ?? '') || null,
    delay_minutes:      typeof f.arrival_delay === 'number' ? Math.round(f.arrival_delay / 60) : null,
    tail_number:        (f.registration as string | null) ?? null,
    aircraft_type:      String((f.aircraft_type as string | null) ?? '') || null,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse()
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const json = (body: unknown, init?: ResponseInit) =>
    Response.json(body, { ...init, headers: { ...(init?.headers ?? {}), ...CORS_HEADERS } })

  let body: { bookingId?: string }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { bookingId } = body
  if (!bookingId) {
    return json({ ok: false, error: 'bookingId required' }, { status: 400 })
  }

  // Fetch the booking
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('flight_number, flight_status, flight_checked_at')
    .eq('id', bookingId)
    .single()

  if (bookingErr || !booking) {
    return json({ ok: false, error: 'Booking not found' }, { status: 404 })
  }

  if (!booking.flight_number) {
    return json({ ok: false, error: 'No flight number on booking' }, { status: 422 })
  }

  // Return cached data if fresh enough
  if (booking.flight_checked_at && booking.flight_status) {
    const age = Date.now() - new Date(booking.flight_checked_at).getTime()
    if (age < CACHE_TTL_MS) {
      return json({ ok: true, data: booking.flight_status, cached: true })
    }
  }

  // Fetch fresh data from FlightAware
  const data = await fetchFromFlightAware(booking.flight_number)

  if (!data) {
    // Return stale cache rather than nothing if FlightAware call failed
    if (booking.flight_status) {
      return json({ ok: true, data: booking.flight_status, cached: true, stale: true })
    }
    return json({ ok: false, error: FLIGHTAWARE_API_KEY ? 'FlightAware returned no results' : 'FLIGHTAWARE_API_KEY not configured' })
  }

  // Persist to cache
  await supabase.from('bookings').update({
    flight_status:     data,
    flight_checked_at: new Date().toISOString(),
  }).eq('id', bookingId)

  return json({ ok: true, data })
})
