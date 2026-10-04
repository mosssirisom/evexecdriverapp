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
  if (!iso) return 'Not recorded'
  // House style: DD/MM/YYYY HH:MM (24-hour), UK time.
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/London' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/London' })
  return `${date} ${time}`
}

function fmtPrice(p: number | null): string {
  if (p == null) return 'TBC'
  return `£${p.toFixed(2)}`
}

// ─── Email templates ──────────────────────────────────────────────────────────

const ROW_LABEL = 'padding:9px 0;color:#64748b;width:118px;border-bottom:1px solid #eef0f3;font-size:12px;text-transform:uppercase;letter-spacing:.04em;vertical-align:top'
const ROW_VALUE = 'padding:9px 0;font-weight:700;color:#0f1b33;border-bottom:1px solid #eef0f3;font-size:14px;vertical-align:top'

function rowsHtml(rows: Array<[string, string]>): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:0 0 20px">${
    rows.map(([l, v]) => `<tr><td style="${ROW_LABEL}">${l}</td><td style="${ROW_VALUE}">${v}</td></tr>`).join('')
  }</table>`
}

function totalHtml(label: string, amount: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 0"><tr>`
    + `<td style="padding:14px 16px;background:#fbf3e0;border-radius:10px 0 0 10px;color:#8a6516;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">${label}</td>`
    + `<td style="padding:14px 16px;background:#fbf3e0;border-radius:0 10px 10px 0;text-align:right;color:#0f1b33;font-size:22px;font-weight:800">${amount}</td>`
    + `</tr></table>`
}

const FOOTNOTE = '<p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:#475569">Questions? Call or WhatsApp 07721 070370.</p>'

function passengerReceiptHtml(b: Record<string, unknown>, ref: string): string {
  const pickup   = (b.pickup_location as string | null) ?? (b.airport as string | null) ?? 'Not recorded'
  const dropoff  = (b.dropoff_address as string | null) ?? (b.airport as string | null) ?? 'Not recorded'
  const price    = fmtPrice(b.quoted_price as number | null)
  const doneAt   = fmt(b.completed_at as string | null)

  return emailShell('Journey receipt', `
    ${pillHtml('Journey receipt', PILL.green)}
    <p style="margin:18px 0 16px;font-size:15px;line-height:1.6;color:#0f1b33">Thank you for travelling with EV Exec. Here's a summary of your journey.</p>
    ${rowsHtml([['Reference', ref], ['Pickup', pickup], ['Drop-off', dropoff], ['Completed', doneAt]])}
    ${totalHtml('Total', price)}
    ${FOOTNOTE}`)
}

function corporateInvoiceHtml(
  b: Record<string, unknown>,
  ref: string,
  driverName: string,
  expenses: Array<{ type: string; amount: number }>,
): string {
  const pickup  = (b.pickup_location as string | null) ?? (b.airport as string | null) ?? 'Not recorded'
  const dropoff = (b.dropoff_address as string | null) ?? (b.airport as string | null) ?? 'Not recorded'
  const price   = b.quoted_price as number | null
  const doneAt  = fmt(b.completed_at as string | null)
  const expTotal = expenses.reduce((s, e) => s + e.amount, 0)
  const grandTotal = (price ?? 0) + expTotal

  const charges: Array<[string, string]> = [
    ['Transfer', fmtPrice(price)],
    ...expenses.map((e): [string, string] => [e.type.replace(/_/g, ' '), `£${e.amount.toFixed(2)}`]),
  ]

  return emailShell('Journey invoice', `
    ${pillHtml('Journey invoice', PILL.gold)}
    <p style="margin:18px 0 16px;font-size:15px;line-height:1.6;color:#0f1b33">Invoice for your completed journey with EV Exec.</p>
    ${rowsHtml([['Reference', ref], ['Driver', driverName], ['Pickup', pickup], ['Drop-off', dropoff], ['Completed', doneAt]])}
    <div style="margin:0 0 4px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.04em">Charges</div>
    ${rowsHtml(charges)}
    ${totalHtml('Total due', `£${grandTotal.toFixed(2)}`)}
    ${FOOTNOTE}`)
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
      `Your EV Exec journey receipt (Ref ${ref})`,
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
      `EV Exec journey invoice (Ref ${ref})`,
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
