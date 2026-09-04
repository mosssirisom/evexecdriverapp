// Thin Resend email client shared across edge functions.
//
// Uses the same RESEND_API_KEY and RECEIPT_FROM already configured for
// send-journey-receipt. Falls back to ok:false gracefully when credentials
// are not configured so functions can be deployed and tested without email.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_ADDRESS   = Deno.env.get('RECEIPT_FROM') ?? 'EV Exec <noreply@evexec.co.uk>'
const APP_URL        = Deno.env.get('APP_URL') ?? 'https://evexec.co.uk'

export interface EmailResult {
  ok: boolean
  id?: string
  error?: string
}

export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
}): Promise<EmailResult> {
  if (!RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY not configured' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      }),
    })

    const json = await res.json().catch(() => null)

    if (!res.ok) {
      return { ok: false, error: json?.message ?? `Resend responded ${res.status}` }
    }

    return { ok: true, id: json?.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Shared layout helpers ────────────────────────────────────────────────────

function base(title: string, content: string): string {
  const logoUrl = `${APP_URL}/logo.png`
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <!-- Header -->
    <div style="background:#060C1A;padding:24px 32px;text-align:center">
      <img src="${logoUrl}" alt="EV Exec" width="56" height="56"
           style="display:block;margin:0 auto 12px;border-radius:8px" />
      <div style="color:#d5a538;font-size:18px;font-weight:700;letter-spacing:2px">EV EXEC</div>
      <div style="color:rgba(255,255,255,0.45);font-size:10px;letter-spacing:3px;margin-top:3px;text-transform:uppercase">Driver Portal</div>
    </div>
    <!-- Content -->
    <div style="padding:32px;background:#ffffff">${content}</div>
    <!-- Footer -->
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center">
      <p style="color:#9ca3af;font-size:11px;margin:0">EV Exec &middot; driver@evexec.co.uk &middot; evexec.co.uk</p>
    </div>
  </div>
</body></html>`
}

function pill(text: string, bg: string, color: string): string {
  return `<span style="display:inline-block;padding:4px 14px;border-radius:99px;font-size:11px;font-weight:700;background:${bg};color:${color};letter-spacing:.5px;text-transform:uppercase">${text}</span>`
}

function infoRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:12px 16px;width:36%;vertical-align:top;border-bottom:1px solid #f3f4f6">
        <span style="color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.7px">${label}</span>
      </td>
      <td style="padding:12px 16px;vertical-align:top;border-bottom:1px solid #f3f4f6">
        <span style="color:#111827;font-size:13px;font-weight:500">${value}</span>
      </td>
    </tr>`
}

function infoCard(rows: Array<{ label: string; value: string }>): string {
  const items = rows.map(r => infoRow(r.label, r.value)).join('')
  return `
  <table width="100%" cellpadding="0" cellspacing="0"
         style="background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;margin-bottom:24px;overflow:hidden;border-collapse:collapse">
    ${items}
  </table>`
}

function ctaButton(text: string, url: string): string {
  return `<a href="${url}"
    style="display:inline-block;padding:13px 28px;border-radius:8px;background:#d5a538;color:#060C1A;font-weight:700;font-size:14px;text-decoration:none;letter-spacing:.3px">
    ${text} &rarr;
  </a>`
}

// ─── Driver email templates ───────────────────────────────────────────────────

export function reminderEmail(opts: {
  driverName: string
  ref: string
  customer: string
  pickup: string
  dropoff: string
  date: string
  time: string
  passengers?: string
  type: '24h' | '1h'
  bookingUrl: string
}): { subject: string; html: string } {
  const subject = opts.type === '24h'
    ? `Reminder: job tomorrow — ${opts.ref}`
    : `1-hour reminder — ${opts.ref}`

  const badge = opts.type === '24h'
    ? pill('Tomorrow', '#fef3c7', '#92400e')
    : pill('1 Hour', '#fee2e2', '#991b1b')

  const headline = opts.type === '24h'
    ? `You have a job <strong>tomorrow at ${opts.time}</strong>.`
    : `Your pickup is in <strong>1 hour at ${opts.time}</strong>.`

  const note = opts.type === '24h'
    ? 'Please ensure your vehicle is clean, fuelled and ready to go.'
    : 'Please make your way to the collection point now.'

  const rows = [
    { label: 'Passenger', value: opts.customer },
    { label: 'Pickup time', value: opts.time },
    { label: 'Date', value: opts.date },
    { label: 'Pickup', value: opts.pickup },
    ...(opts.dropoff ? [{ label: 'Drop-off', value: opts.dropoff }] : []),
    ...(opts.passengers ? [{ label: 'Passengers', value: opts.passengers }] : []),
  ]

  const html = base(subject, `
    <p style="margin:0 0 16px;color:#374151;font-size:14px">Hi ${opts.driverName},</p>
    ${badge}
    <h2 style="color:#111827;font-size:20px;font-weight:700;margin:14px 0 6px">${opts.ref}</h2>
    <p style="color:#374151;font-size:14px;margin:0 0 24px">${headline}</p>
    ${infoCard(rows)}
    <p style="color:#6b7280;font-size:13px;margin:0 0 24px">${note}</p>
    ${ctaButton('View Job Details', opts.bookingUrl)}
  `)

  return { subject, html }
}

export function cancellationEmail(opts: {
  driverName: string
  ref: string
  customer: string
  date?: string
  time?: string
  pickup?: string
  bookingUrl: string
}): { subject: string; html: string } {
  const subject = `Job cancelled — ${opts.ref}`

  const rows = [
    { label: 'Passenger', value: opts.customer },
    ...(opts.time ? [{ label: 'Pickup time', value: opts.time }] : []),
    ...(opts.date ? [{ label: 'Date', value: opts.date }] : []),
    ...(opts.pickup ? [{ label: 'Pickup', value: opts.pickup }] : []),
  ]

  const html = base(subject, `
    <p style="margin:0 0 16px;color:#374151;font-size:14px">Hi ${opts.driverName},</p>
    ${pill('Cancelled', '#fee2e2', '#991b1b')}
    <h2 style="color:#111827;font-size:20px;font-weight:700;margin:14px 0 6px">${opts.ref}</h2>
    <p style="color:#374151;font-size:14px;margin:0 0 24px">
      The booking for <strong>${opts.customer}</strong> has been cancelled.
      <strong>Please do not travel to the collection point.</strong>
    </p>
    ${rows.length > 0 ? infoCard(rows) : ''}
    ${ctaButton('View Booking', opts.bookingUrl)}
  `)

  return { subject, html }
}

export function updateEmail(opts: {
  driverName: string
  ref: string
  customer: string
  date: string
  time: string
  pickup: string
  dropoff: string
  bookingUrl: string
}): { subject: string; html: string } {
  const subject = `Job updated — ${opts.ref}`

  const rows = [
    { label: 'Passenger', value: opts.customer },
    { label: 'Pickup time', value: opts.time },
    { label: 'Date', value: opts.date },
    { label: 'Pickup', value: opts.pickup },
    ...(opts.dropoff ? [{ label: 'Drop-off', value: opts.dropoff }] : []),
  ]

  const html = base(subject, `
    <p style="margin:0 0 16px;color:#374151;font-size:14px">Hi ${opts.driverName},</p>
    ${pill('Updated', '#dbeafe', '#1d4ed8')}
    <h2 style="color:#111827;font-size:20px;font-weight:700;margin:14px 0 6px">${opts.ref}</h2>
    <p style="color:#374151;font-size:14px;margin:0 0 24px">
      Journey details for <strong>${opts.customer}</strong> have changed — please review the updated information below.
    </p>
    ${infoCard(rows)}
    ${ctaButton('View Updated Job', opts.bookingUrl)}
  `)

  return { subject, html }
}
