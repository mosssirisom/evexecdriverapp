// Notify Passenger Arrived — Edge Function
//
// Notifies the passenger when the driver marks status "Arrived".
// Email is the primary channel; SMS is the fallback when no email is on file
// or when the email send fails.
//
// Required secrets:
//   RESEND_API_KEY, RECEIPT_FROM (email primary)
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER (SMS fallback)
//
// POST body: { bookingId: string }
// Returns:   { ok: boolean; channel?: string; skipped?: string; error?: string }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { CORS_HEADERS, corsPreflightResponse } from '../_shared/cors.ts'
import { emailShell, pillHtml, PILL } from '../_shared/emailLayout.ts'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY') ?? ''
const RECEIPT_FROM              = Deno.env.get('RECEIPT_FROM') ?? 'EV Exec <receipts@evexec.co.uk>'
const TWILIO_ACCOUNT_SID        = Deno.env.get('TWILIO_ACCOUNT_SID') ?? ''
const TWILIO_AUTH_TOKEN         = Deno.env.get('TWILIO_AUTH_TOKEN') ?? ''
const TWILIO_FROM_NUMBER        = Deno.env.get('TWILIO_FROM_NUMBER') ?? ''
// Twilio is dormant: nothing is sent unless the SMS_ENABLED=true secret is set.
const SMS_ENABLED               = Deno.env.get('SMS_ENABLED') === 'true'

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) return false
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: RECEIPT_FROM, to, subject, html }),
  })
  if (!res.ok) console.error('[notify-passenger-arrived] Resend error:', await res.text())
  return res.ok
}

function arrivedEmailHtml(customerName: string | null, location: string, ref: string): string {
  const name = customerName?.split(' ')[0] || 'there'
  const row = (l: string, v: string) =>
    `<tr><td style="padding:9px 0;color:#64748b;width:118px;border-bottom:1px solid #eef0f3;font-size:12px;text-transform:uppercase;letter-spacing:.04em;vertical-align:top">${l}</td>`
    + `<td style="padding:9px 0;font-weight:700;color:#0f1b33;border-bottom:1px solid #eef0f3;font-size:14px;vertical-align:top">${v}</td></tr>`
  return emailShell('Driver arrived', `
    ${pillHtml('Driver arrived', PILL.green)}
    <p style="margin:18px 0 16px;font-size:15px;line-height:1.6;color:#0f1b33">Hi ${name}, your driver has arrived at your pickup point and is ready when you are.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:0">${row('Reference', ref)}${row('Pickup', location)}</table>
    <p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:#475569">Questions? Call or WhatsApp 07721 070370.</p>`)
}

async function sendSms(to: string, body: string): Promise<boolean> {
  if (!SMS_ENABLED || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) return false
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: TWILIO_FROM_NUMBER, Body: body }).toString(),
    }
  )
  if (!res.ok) console.error('[notify-passenger-arrived] Twilio error:', await res.text())
  return res.ok
}

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
    .select('customer_name, customer_email, customer_phone, ref, pickup_location, airport')
    .eq('id', bookingId)
    .single()

  if (!booking) {
    return json({ ok: false, error: 'Booking not found' }, { status: 404 })
  }

  const ref = booking.ref ?? bookingId.slice(0, 8).toUpperCase()
  const location = booking.pickup_location ?? booking.airport ?? 'your pickup point'
  const smsBody = `Your EV Exec driver has arrived at ${location}. Booking ref: ${ref}. Please make your way to the vehicle.`

  // Email primary
  if (booking.customer_email) {
    const ok = await sendEmail(
      booking.customer_email,
      `Your EV Exec driver has arrived — ${ref}`,
      arrivedEmailHtml(booking.customer_name, location, ref),
    )
    if (ok) return json({ ok: true, channel: 'email' })
    // Email failed — fall through to SMS
  }

  // SMS fallback
  if (booking.customer_phone) {
    const ok = await sendSms(booking.customer_phone, smsBody)
    return json({ ok, channel: 'sms' })
  }

  return json({ ok: true, skipped: 'no_contact' })
})
