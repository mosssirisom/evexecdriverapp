// Thin Resend email client shared across edge functions.
//
// Uses the same RESEND_API_KEY and RECEIPT_FROM already configured for
// send-journey-receipt. Falls back to ok:false gracefully when credentials
// are not configured so functions can be deployed and tested without email.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_ADDRESS   = Deno.env.get('RECEIPT_FROM') ?? 'EV Exec <noreply@evexec.co.uk>'

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

// ─── Driver email templates ───────────────────────────────────────────────────

function base(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:#060C1A;padding:24px 32px;text-align:center">
      <div style="color:#d5a538;font-size:20px;font-weight:700;letter-spacing:2px">EV EXEC</div>
      <div style="color:rgba(255,255,255,0.4);font-size:10px;letter-spacing:3px;margin-top:3px;text-transform:uppercase">Driver Portal</div>
    </div>
    <div style="padding:28px 32px">${content}</div>
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center">
      <p style="color:#9ca3af;font-size:11px;margin:0">EV Exec · driver@evexec.co.uk · evexec.co.uk</p>
    </div>
  </div>
</body></html>`
}

function pill(text: string, bg: string, color: string): string {
  return `<span style="display:inline-block;padding:4px 12px;border-radius:99px;font-size:11px;font-weight:600;background:${bg};color:${color};letter-spacing:.5px">${text}</span>`
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:7px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;width:40%">${label}</td>
    <td style="padding:7px 0;border-bottom:1px solid #f3f4f6;color:#111827;font-size:13px">${value}</td>
  </tr>`
}

export function reminderEmail(opts: {
  driverName: string
  ref: string
  customer: string
  route: string
  date: string
  time: string
  type: '24h' | '1h'
  bookingUrl: string
}): { subject: string; html: string } {
  const subject = opts.type === '24h'
    ? `Reminder: job tomorrow — ${opts.ref}`
    : `1-hour reminder — ${opts.ref}`

  const badge = opts.type === '24h'
    ? pill('TOMORROW', '#fef3c7', '#92400e')
    : pill('1 HOUR', '#fee2e2', '#991b1b')

  const headline = opts.type === '24h'
    ? `You have a job tomorrow at <strong>${opts.time}</strong>.`
    : `Your pickup is in <strong>1 hour</strong> at ${opts.time}.`

  const note = opts.type === '24h'
    ? 'Please ensure your vehicle is clean, fuelled and ready.'
    : 'Please make your way to the collection point now.'

  const html = base(subject, `
    <p style="margin:0 0 4px;color:#6b7280;font-size:13px">Hi ${opts.driverName},</p>
    ${badge}
    <h2 style="color:#111827;font-size:18px;margin:12px 0 4px">${opts.ref}</h2>
    <p style="color:#374151;font-size:14px;margin:0 0 20px">${headline}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
      ${row('Passenger', opts.customer)}
      ${row('Date', opts.date)}
      ${row('Pickup', opts.time)}
      ${row('Route', opts.route)}
    </table>
    <p style="color:#6b7280;font-size:13px;margin:0 0 20px">${note}</p>
    <a href="${opts.bookingUrl}"
      style="display:inline-block;padding:12px 28px;border-radius:8px;background:#d5a538;color:#060C1A;font-weight:700;font-size:14px;text-decoration:none">
      View Job Details →
    </a>
  `)

  return { subject, html }
}

export function cancellationEmail(opts: {
  driverName: string
  ref: string
  customer: string
  bookingUrl: string
}): { subject: string; html: string } {
  const subject = `Job cancelled — ${opts.ref}`

  const html = base(subject, `
    <p style="margin:0 0 4px;color:#6b7280;font-size:13px">Hi ${opts.driverName},</p>
    ${pill('CANCELLED', '#fee2e2', '#991b1b')}
    <h2 style="color:#111827;font-size:18px;margin:12px 0 4px">${opts.ref}</h2>
    <p style="color:#374151;font-size:14px;margin:0 0 20px">
      The booking for <strong>${opts.customer}</strong> has been cancelled.
      Please do not travel to the collection point.
    </p>
    <a href="${opts.bookingUrl}"
      style="display:inline-block;padding:12px 28px;border-radius:8px;background:#d5a538;color:#060C1A;font-weight:700;font-size:14px;text-decoration:none">
      View Booking →
    </a>
  `)

  return { subject, html }
}

export function updateEmail(opts: {
  driverName: string
  ref: string
  customer: string
  date: string
  time: string
  route: string
  bookingUrl: string
}): { subject: string; html: string } {
  const subject = `Job updated — ${opts.ref}`

  const html = base(subject, `
    <p style="margin:0 0 4px;color:#6b7280;font-size:13px">Hi ${opts.driverName},</p>
    ${pill('UPDATED', '#e0f2fe', '#0369a1')}
    <h2 style="color:#111827;font-size:18px;margin:12px 0 4px">${opts.ref}</h2>
    <p style="color:#374151;font-size:14px;margin:0 0 20px">
      Journey details for <strong>${opts.customer}</strong> have changed. Please review the updated information below.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
      ${row('Passenger', opts.customer)}
      ${row('Date', opts.date)}
      ${row('Pickup', opts.time)}
      ${row('Route', opts.route)}
    </table>
    <a href="${opts.bookingUrl}"
      style="display:inline-block;padding:12px 28px;border-radius:8px;background:#d5a538;color:#060C1A;font-weight:700;font-size:14px;text-decoration:none">
      View Updated Job →
    </a>
  `)

  return { subject, html }
}
