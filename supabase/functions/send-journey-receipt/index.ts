// Journey Receipt Automation
//
// Triggered by the driver app after marking a journey Completed.
// Sends:
//   1. A passenger receipt to customer_email (branded, journey summary)
//      — falls back to a two-tap SMS handoff to the assigned driver if no
//        customer_email is on file (driver_sms_reminders, reminder_type
//        'completed') -- no Twilio call.
//   2. A corporate invoice to corporate_email (expenses breakdown, totals)
//
// Email is the primary channel for the passenger receipt.
//
// Required secrets:
//   RESEND_API_KEY, RECEIPT_FROM  — email (primary)
//
// POST body: { bookingId: string }
// Returns:   { ok: boolean; sent: string[]; error?: string }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { CORS_HEADERS, corsPreflightResponse } from '../_shared/cors.ts'
import { emailLayout, emailLead, emailRow, emailRefBadge, emailPrice, emailFootnote } from '../_shared/emailLayout.ts'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY') ?? ''
const RECEIPT_FROM              = Deno.env.get('RECEIPT_FROM') ?? 'EV Exec <receipts@evexec.co.uk>'

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

  const body = [
    emailLead("Thank you for travelling with EV Exec. Here's a summary of your journey."),
    emailRefBadge(ref),
    emailRow('Pick-up', pickup),
    emailRow('Drop-off', dropoff),
    emailRow('Completed', doneAt, true),
    emailPrice(price),
  ].join('')

  return emailLayout({ title: 'Journey Receipt', body })
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

  const expenseRows = expenses.length > 0
    ? expenses.map((e) => emailRow(e.type.replace(/_/g, ' '), `£${e.amount.toFixed(2)}`)).join('')
    : emailFootnote('No additional expenses.')

  const body = [
    emailLead(`Journey invoice for the transfer completed by ${driverName}.`),
    emailRefBadge(ref),
    emailRow('Driver', driverName),
    emailRow('Pick-up', pickup),
    emailRow('Drop-off', dropoff),
    emailRow('Completed', doneAt, true),
    emailRow('Journey Charge', fmtPrice(price)),
    expenseRows,
    emailPrice(`Total Due: £${grandTotal.toFixed(2)}`),
  ].join('')

  return emailLayout({ title: 'Journey Invoice', body })
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

  // Two-tap SMS handoff — only if no email or email send failed, and a
  // driver is assigned to hand it off to (always true at journey Completed).
  if (!sent.includes('customer_email') && booking.customer_phone && booking.assigned_driver_id) {
    const price = booking.quoted_price != null ? ` Total: £${(booking.quoted_price as number).toFixed(2)}.` : ''
    const smsBody = `Your EV Exec journey is complete. Booking ref: ${ref}.${price} Thank you for travelling with us.`
    const { error: handoffErr } = await supabase
      .from('driver_sms_reminders')
      .upsert(
        {
          booking_id: bookingId,
          driver_id: booking.assigned_driver_id,
          reminder_type: 'completed',
          customer_name: booking.customer_name ?? null,
          customer_phone: booking.customer_phone,
          travel_date: booking.travel_date ?? null,
          travel_time: booking.travel_time ?? null,
          message: smsBody,
          status: 'pending',
        },
        { onConflict: 'booking_id,reminder_type', ignoreDuplicates: true }
      )
    if (!handoffErr) sent.push('customer_sms_handoff')
    else console.error('[send-journey-receipt] driver_sms_reminders handoff error:', handoffErr.message)
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
