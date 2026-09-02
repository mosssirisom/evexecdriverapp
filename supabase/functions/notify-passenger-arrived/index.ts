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

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY') ?? ''
const RECEIPT_FROM              = Deno.env.get('RECEIPT_FROM') ?? 'EV Exec <receipts@evexec.co.uk>'
const APP_URL                   = Deno.env.get('APP_URL') ?? 'https://evexec.co.uk'
const LOGO_URL                  = `${APP_URL}/logo.png`
const TWILIO_ACCOUNT_SID        = Deno.env.get('TWILIO_ACCOUNT_SID') ?? ''
const TWILIO_AUTH_TOKEN         = Deno.env.get('TWILIO_AUTH_TOKEN') ?? ''
const TWILIO_FROM_NUMBER        = Deno.env.get('TWILIO_FROM_NUMBER') ?? ''

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
  const name = customerName ?? 'Passenger'
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <div style="background:#060C1A;padding:28px 32px;text-align:center">
      <img src="${LOGO_URL}" alt="EV Exec" width="56" height="56"
           style="display:block;margin:0 auto 12px;border-radius:8px" />
      <div style="color:#d5a538;font-size:20px;font-weight:700;letter-spacing:2px">EV EXEC</div>
      <div style="color:rgba(255,255,255,0.4);font-size:11px;letter-spacing:3px;margin-top:4px;text-transform:uppercase">Your Driver Has Arrived</div>
    </div>
    <div style="padding:32px">
      <p style="color:#374151;font-size:15px;margin:0 0 16px">Hi ${name},</p>
      <p style="color:#374151;font-size:15px;margin:0 0 24px">Your EV Exec driver has arrived at <strong>${location}</strong>. Please make your way to the vehicle.</p>
      <div style="background:#f9fafb;border-radius:8px;padding:16px;border:1px solid #e5e7eb">
        <div style="color:#6b7280;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">Booking Reference</div>
        <div style="color:#111827;font-size:18px;font-weight:700">${ref}</div>
      </div>
    </div>
    <div style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb">
      <p style="color:#9ca3af;font-size:12px;margin:0;text-align:center">EV Exec · support@evexec.co.uk · +44 7721 070370</p>
    </div>
  </div>
</body>
</html>`
}

async function sendSms(to: string, body: string): Promise<boolean> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) return false
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
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization,content-type',
      },
    })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  let body: { bookingId?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { bookingId } = body
  if (!bookingId) {
    return Response.json({ ok: false, error: 'bookingId required' }, { status: 400 })
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('customer_name, customer_email, customer_phone, ref, pickup_location, airport')
    .eq('id', bookingId)
    .single()

  if (!booking) {
    return Response.json({ ok: false, error: 'Booking not found' }, { status: 404 })
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
    if (ok) return Response.json({ ok: true, channel: 'email' })
    // Email failed — fall through to SMS
  }

  // SMS fallback
  if (booking.customer_phone) {
    const ok = await sendSms(booking.customer_phone, smsBody)
    return Response.json({ ok, channel: 'sms' })
  }

  return Response.json({ ok: true, skipped: 'no_contact' })
})
