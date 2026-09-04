// Journey Receipt Automation
//
// Triggered by the driver app after marking a journey Completed.
// Sends:
//   1. A passenger receipt to customer_email (branded, journey summary)
//      — falls back to SMS if no customer_email is on file
//   2. A corporate invoice to corporate_email (expenses breakdown, totals)
//
// Email is the primary channel; SMS is the fallback for the passenger receipt
// when no customer_email exists.
//
// Required secrets:
//   RESEND_API_KEY, RECEIPT_FROM  — email (primary)
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER — SMS (fallback)
//
// POST body: { bookingId: string }
// Returns:   { ok: boolean; sent: string[]; error?: string }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { CORS_HEADERS, corsPreflightResponse } from '../_shared/cors.ts'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY') ?? ''
const RECEIPT_FROM              = Deno.env.get('RECEIPT_FROM') ?? 'EV Exec <receipts@evexec.co.uk>'
const APP_URL                   = Deno.env.get('APP_URL') ?? 'https://evexec.co.uk'
const LOGO_URL                  = `${APP_URL}/logo.png`
const TWILIO_ACCOUNT_SID        = Deno.env.get('TWILIO_ACCOUNT_SID') ?? ''
const TWILIO_AUTH_TOKEN         = Deno.env.get('TWILIO_AUTH_TOKEN') ?? ''
const TWILIO_FROM_NUMBER        = Deno.env.get('TWILIO_FROM_NUMBER') ?? ''

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
  if (!res.ok) console.error('[send-journey-receipt] Twilio error:', await res.text())
  return res.ok
}

// ─── Email helpers ────────────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn('[send-journey-receipt] RESEND_API_KEY not configured')
    return false
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: RECEIPT_FROM, to, subject, html }),
  })
  if (!res.ok) {
    const err = await res.text()
    console.error('[send-journey-receipt] Resend error:', err)
  }
  return res.ok
}

function fmt(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
  })
}

function fmtPrice(p: number | null): string {
  if (p == null) return '—'
  return `£${p.toFixed(2)}`
}

// ─── Email templates ──────────────────────────────────────────────────────────

function passengerReceiptHtml(b: Record<string, unknown>, ref: string): string {
  const pickup   = (b.pickup_location as string | null) ?? (b.airport as string | null) ?? '—'
  const dropoff  = (b.dropoff_address as string | null) ?? (b.airport as string | null) ?? '—'
  const price    = fmtPrice(b.quoted_price as number | null)
  const doneAt   = fmt(b.completed_at as string | null)

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <!-- Header -->
    <div style="background:#060C1A;padding:28px 32px;text-align:center">
      <img src="${LOGO_URL}" alt="EV Exec" width="56" height="56"
           style="display:block;margin:0 auto 12px;border-radius:8px" />
      <div style="color:#d5a538;font-size:20px;font-weight:700;letter-spacing:2px">EV EXEC</div>
      <div style="color:rgba(255,255,255,0.4);font-size:11px;letter-spacing:3px;margin-top:4px;text-transform:uppercase">Journey Receipt</div>
    </div>
    <!-- Body -->
    <div style="padding:32px">
      <p style="color:#374151;font-size:15px;margin:0 0 24px">Thank you for travelling with EV Exec. Here's a summary of your journey.</p>
      <!-- Ref -->
      <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:24px;border:1px solid #e5e7eb">
        <div style="color:#6b7280;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">Booking Reference</div>
        <div style="color:#111827;font-size:18px;font-weight:700">${ref}</div>
      </div>
      <!-- Journey details -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;border-collapse:collapse">
        <tr>
          <td style="padding:12px 16px;width:36%;background:#f9fafb;border-bottom:1px solid #f3f4f6">
            <div style="color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Pick-up</div>
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #f3f4f6">
            <div style="color:#111827;font-size:13px;font-weight:500">${pickup}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 16px;background:#f9fafb;border-bottom:1px solid #f3f4f6">
            <div style="color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Drop-off</div>
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #f3f4f6">
            <div style="color:#111827;font-size:13px;font-weight:500">${dropoff}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 16px;background:#f9fafb">
            <div style="color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Completed</div>
          </td>
          <td style="padding:12px 16px">
            <div style="color:#111827;font-size:13px;font-weight:500">${doneAt}</div>
          </td>
        </tr>
      </table>
      <!-- Total -->
      <div style="background:#060C1A;border-radius:8px;padding:20px;text-align:right">
        <div style="color:rgba(255,255,255,0.5);font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Total</div>
        <div style="color:#d5a538;font-size:28px;font-weight:700;margin-top:4px">${price}</div>
      </div>
    </div>
    <!-- Footer -->
    <div style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb">
      <p style="color:#9ca3af;font-size:12px;margin:0;text-align:center">EV Exec · support@evexec.co.uk · +44 7721 070370</p>
    </div>
  </div>
</body>
</html>`
}

function corporateInvoiceHtml(
  b: Record<string, unknown>,
  ref: string,
  driverName: string,
  expenses: Array<{ type: string; amount: number }>,
): string {
  const pickup  = (b.pickup_location as string | null) ?? (b.airport as string | null) ?? '—'
  const dropoff = (b.dropoff_address as string | null) ?? (b.airport as string | null) ?? '—'
  const price   = b.quoted_price as number | null
  const doneAt  = fmt(b.completed_at as string | null)
  const expTotal = expenses.reduce((s, e) => s + e.amount, 0)
  const grandTotal = (price ?? 0) + expTotal

  const expRows = expenses.length > 0
    ? expenses.map(e => `
      <tr>
        <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;color:#374151;font-size:13px;text-transform:capitalize">${e.type.replace(/_/g, ' ')}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;color:#374151;font-size:13px;text-align:right">£${e.amount.toFixed(2)}</td>
      </tr>`).join('')
    : `<tr><td colspan="2" style="padding:10px 16px;color:#9ca3af;font-size:13px">No additional expenses</td></tr>`

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:640px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <!-- Header -->
    <div style="background:#060C1A;padding:24px 32px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:middle">
            <img src="${LOGO_URL}" alt="EV Exec" width="48" height="48"
                 style="display:inline-block;border-radius:6px;vertical-align:middle;margin-right:12px" />
            <span style="color:#d5a538;font-size:20px;font-weight:700;letter-spacing:2px;vertical-align:middle">EV EXEC</span>
            <div style="color:rgba(255,255,255,0.4);font-size:10px;letter-spacing:3px;text-transform:uppercase;margin-top:4px">Journey Invoice</div>
          </td>
          <td style="text-align:right;vertical-align:middle">
            <div style="color:rgba(255,255,255,0.4);font-size:11px;text-transform:uppercase;letter-spacing:1px">Ref</div>
            <div style="color:#ffffff;font-size:16px;font-weight:700">${ref}</div>
          </td>
        </tr>
      </table>
    </div>
    <!-- Body -->
    <div style="padding:32px">
      <!-- Journey summary -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;border-collapse:collapse">
        <tr>
          <td style="padding:10px 16px;width:36%;background:#f9fafb;border-bottom:1px solid #f3f4f6">
            <span style="color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Driver</span>
          </td>
          <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6">
            <span style="color:#111827;font-size:13px;font-weight:500">${driverName}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 16px;background:#f9fafb;border-bottom:1px solid #f3f4f6">
            <span style="color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Pick-up</span>
          </td>
          <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6">
            <span style="color:#111827;font-size:13px;font-weight:500">${pickup}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 16px;background:#f9fafb;border-bottom:1px solid #f3f4f6">
            <span style="color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Drop-off</span>
          </td>
          <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6">
            <span style="color:#111827;font-size:13px;font-weight:500">${dropoff}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 16px;background:#f9fafb">
            <span style="color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Completed</span>
          </td>
          <td style="padding:10px 16px">
            <span style="color:#111827;font-size:13px;font-weight:500">${doneAt}</span>
          </td>
        </tr>
      </table>

      <!-- Journey charge -->
      <div style="margin-bottom:8px;color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Journey Charge</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;border-collapse:collapse">
        <tr>
          <td style="padding:10px 16px;color:#374151;font-size:13px">Transfer</td>
          <td style="padding:10px 16px;color:#374151;font-size:13px;text-align:right">${fmtPrice(price)}</td>
        </tr>
      </table>

      ${expenses.length > 0 ? `
      <div style="margin-bottom:8px;color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Additional Expenses</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;border-collapse:collapse">
        ${expRows}
      </table>` : ''}

      <!-- Total -->
      <div style="background:#060C1A;border-radius:8px;padding:20px">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="color:rgba(255,255,255,0.5);font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Total Due</td>
            <td style="text-align:right;color:#d5a538;font-size:24px;font-weight:700">£${grandTotal.toFixed(2)}</td>
          </tr>
        </table>
      </div>
    </div>
    <!-- Footer -->
    <div style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb">
      <p style="color:#9ca3af;font-size:12px;margin:0;text-align:center">EV Exec · support@evexec.co.uk · +44 7721 070370</p>
    </div>
  </div>
</body>
</html>`
}

// ─── Handler ──────────────────────────────────────────────────────────────────

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

  // Fetch booking
  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single()

  if (bErr || !booking) {
    return json({ ok: false, error: 'Booking not found' }, { status: 404 })
  }

  if (booking.receipt_sent_at) {
    return json({ ok: true, sent: [], cached: true })
  }

  const ref = (booking.ref as string | null) ?? booking.id.slice(0, 8).toUpperCase()

  // Fetch driver name
  let driverName = 'Your Driver'
  if (booking.assigned_driver_id) {
    const { data: driver } = await supabase
      .from('drivers')
      .select('full_name')
      .eq('id', booking.assigned_driver_id)
      .single()
    if (driver?.full_name) driverName = driver.full_name
  }

  // Fetch expenses
  const { data: expenseRows } = await supabase
    .from('booking_expenses')
    .select('type, amount')
    .eq('booking_id', bookingId)

  const expenses = (expenseRows ?? []) as Array<{ type: string; amount: number }>

  const sent: string[] = []

  // Send passenger receipt (email primary, SMS fallback)
  if (booking.customer_email) {
    const ok = await sendEmail(
      booking.customer_email,
      `Your EV Exec journey receipt — ${ref}`,
      passengerReceiptHtml(booking, ref),
    )
    if (ok) sent.push('customer_email')
  }

  // SMS fallback — only if no email or email send failed
  if (!sent.includes('customer_email') && booking.customer_phone) {
    const price = booking.quoted_price != null ? ` Total: £${(booking.quoted_price as number).toFixed(2)}.` : ''
    const smsBody = `Your EV Exec journey is complete. Booking ref: ${ref}.${price} Thank you for travelling with us.`
    const ok = await sendSms(booking.customer_phone, smsBody)
    if (ok) sent.push('customer_sms')
  }

  // Send corporate invoice
  if (booking.corporate_email) {
    const ok = await sendEmail(
      booking.corporate_email,
      `EV Exec journey invoice — ${ref}`,
      corporateInvoiceHtml(booking, ref, driverName, expenses),
    )
    if (ok) sent.push('corporate')
  }

  // Stamp receipt_sent_at
  if (sent.length > 0) {
    await supabase
      .from('bookings')
      .update({ receipt_sent_at: new Date().toISOString() })
      .eq('id', bookingId)
  }

  return json({ ok: true, sent })
})
