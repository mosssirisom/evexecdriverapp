// Notify Passenger Arrived — Edge Function
//
// Sends a brief SMS to the passenger when the driver marks status "Arrived".
// Called fire-and-forget from the driver app client.
//
// Required secrets:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
//
// POST body: { bookingId: string }
// Returns:   { ok: boolean; skipped?: string; error?: string }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { CORS_HEADERS, corsPreflightResponse } from '../_shared/cors.ts'

const SUPABASE_URL             = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const TWILIO_ACCOUNT_SID       = Deno.env.get('TWILIO_ACCOUNT_SID') ?? ''
const TWILIO_AUTH_TOKEN        = Deno.env.get('TWILIO_AUTH_TOKEN') ?? ''
const TWILIO_FROM_NUMBER       = Deno.env.get('TWILIO_FROM_NUMBER') ?? ''

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse()
  }

  const json = (body: unknown, init?: ResponseInit) =>
    Response.json(body, { ...init, headers: { ...(init?.headers ?? {}), ...CORS_HEADERS } })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

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

  const { data: booking } = await supabase
    .from('bookings')
    .select('customer_phone, customer_name, ref, pickup_location, airport')
    .eq('id', bookingId)
    .single()

  if (!booking?.customer_phone) {
    return json({ ok: true, skipped: 'no_phone' })
  }

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    console.warn('[notify-passenger-arrived] Twilio not configured — skipping SMS')
    return json({ ok: true, skipped: 'twilio_not_configured' })
  }

  const ref = booking.ref ?? bookingId.slice(0, 8).toUpperCase()
  const location = booking.pickup_location ?? booking.airport ?? 'your pickup point'
  const msg = `Your EV Exec driver has arrived at ${location}. Booking ref: ${ref}. Please make your way to the vehicle.`

  const params = new URLSearchParams({
    To:   booking.customer_phone,
    From: TWILIO_FROM_NUMBER,
    Body: msg,
  })

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    console.error('[notify-passenger-arrived] Twilio error:', err)
    return json({ ok: false, error: 'SMS send failed' })
  }

  return json({ ok: true })
})
