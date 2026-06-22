// Journey Receipt Automation
//
// Triggered by the driver app after marking a journey Completed.
// Sends:
//   1. A passenger receipt to customer_email (branded, journey summary)
//   2. A corporate invoice to corporate_email (expenses breakdown, totals)
//
// Uses Resend (https://resend.com) for delivery.
//
// Required secrets:
//   RESEND_API_KEY  — Resend API key
//   RECEIPT_FROM    — "From" address, e.g. "EV Exec <receipts@evexec.co.uk>"
//
// POST body: { bookingId: string }
// Returns:   { ok: boolean; sent: string[]; error?: string }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL             = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY           = Deno.env.get('RESEND_API_KEY') ?? ''
const RECEIPT_FROM             = Deno.env.get('RECEIPT_FROM') ?? 'EV Exec <receipts@evexec.co.uk>'

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
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden">
    <!-- Header -->
    <div style="background:#060C1A;padding:32px 32px 24px;text-align:center">
      <div style="color:#d5a538;font-size:22px;font-weight:700;letter-spacing:2px">EV EXEC</div>
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
      <!-- Route -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6">
            <div style="color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Pick-up</div>
            <div style="color:#111827;font-size:14px;margin-top:4px">${pickup}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6">
            <div style="color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Drop-off</div>
            <div style="color:#111827;font-size:14px;margin-top:4px">${dropoff}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0">
            <div style="color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Completed</div>
            <div style="color:#111827;font-size:14px;margin-top:4px">${doneAt}</div>
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
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#374151;font-size:13px;text-transform:capitalize">${e.type.replace(/_/g, ' ')}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#374151;font-size:13px;text-align:right">£${e.amount.toFixed(2)}</td>
      </tr>`).join('')
    : `<tr><td colspan="2" style="padding:8px 0;color:#9ca3af;font-size:13px">No additional expenses</td></tr>`

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:640px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden">
    <div style="background:#060C1A;padding:32px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="color:#d5a538;font-size:22px;font-weight:700;letter-spacing:2px">EV EXEC</div>
        <div style="color:rgba(255,255,255,0.4);font-size:11px;letter-spacing:3px;text-transform:uppercase;margin-top:4px">Journey Invoice</div>
      </div>
      <div style="text-align:right">
        <div style="color:rgba(255,255,255,0.4);font-size:11px;text-transform:uppercase;letter-spacing:1px">Ref</div>
        <div style="color:#ffffff;font-size:16px;font-weight:700">${ref}</div>
      </div>
    </div>
    <div style="padding:32px">
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
        <tr>
          <td style="padding:6px 0;border-bottom:1px solid #f3f4f6">
            <span style="color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Driver</span>
            <span style="float:right;color:#111827;font-size:13px">${driverName}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;border-bottom:1px solid #f3f4f6">
            <span style="color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Pick-up</span>
            <span style="float:right;color:#111827;font-size:13px">${pickup}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;border-bottom:1px solid #f3f4f6">
            <span style="color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Drop-off</span>
            <span style="float:right;color:#111827;font-size:13px">${dropoff}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0">
            <span style="color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Completed</span>
            <span style="float:right;color:#111827;font-size:13px">${doneAt}</span>
          </td>
        </tr>
      </table>

      <div style="margin-bottom:8px;color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Journey Charge</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#374151;font-size:13px">Transfer</td>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#374151;font-size:13px;text-align:right">${fmtPrice(price)}</td>
        </tr>
      </table>

      ${expenses.length > 0 ? `
      <div style="margin-bottom:8px;color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Additional Expenses</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
        ${expRows}
      </table>` : ''}

      <div style="background:#060C1A;border-radius:8px;padding:20px">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="color:rgba(255,255,255,0.5);font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Total Due</td>
            <td style="text-align:right;color:#d5a538;font-size:24px;font-weight:700">£${grandTotal.toFixed(2)}</td>
          </tr>
        </table>
      </div>
    </div>
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
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type' },
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

  // Fetch booking
  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single()

  if (bErr || !booking) {
    return Response.json({ ok: false, error: 'Booking not found' }, { status: 404 })
  }

  if (booking.receipt_sent_at) {
    return Response.json({ ok: true, sent: [], cached: true })
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

  // Send passenger receipt
  if (booking.customer_email) {
    const ok = await sendEmail(
      booking.customer_email,
      `Your EV Exec journey receipt — ${ref}`,
      passengerReceiptHtml(booking, ref),
    )
    if (ok) sent.push('customer')
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

  return Response.json({ ok: true, sent })
})
