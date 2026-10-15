// Thin Resend email client shared across edge functions.
//
// Uses the same RESEND_API_KEY and RECEIPT_FROM already configured for
// send-journey-receipt. Falls back to ok:false gracefully when credentials
// are not configured so functions can be deployed and tested without email.

import { emailShell } from './emailLayout.ts'

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

// ─── Shared layout helpers ────────────────────────────────────────────────────

function base(title: string, content: string): string {
  return emailShell(title, content)
}

function pill(text: string, bg: string, color: string): string {
  return `<span style="display:inline-block;background:${bg};color:${color};border-radius:999px;padding:6px 14px;font-size:12px;font-weight:700">${text}</span>`
}

function infoRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:9px 0;width:118px;vertical-align:top;border-bottom:1px solid #eef0f3">
        <span style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.04em">${label}</span>
      </td>
      <td style="padding:9px 0;vertical-align:top;border-bottom:1px solid #eef0f3">
        <span style="color:#0f1b33;font-size:14px;font-weight:700">${value}</span>
      </td>
    </tr>`
}

function infoCard(rows: Array<{ label: string; value: string }>): string {
  const items = rows.map(r => infoRow(r.label, r.value)).join('')
  return `
  <table width="100%" cellpadding="0" cellspacing="0"
         style="margin-bottom:24px;border-collapse:collapse">
    ${items}
  </table>`
}

function ctaButton(text: string, url: string): string {
  return `<a href="${url}"
    style="display:inline-block;padding:13px 28px;border-radius:8px;background:#C9A550;color:#0B132B;font-weight:700;font-size:14px;text-decoration:none;letter-spacing:.3px">
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
    ? `Reminder: job tomorrow, ${opts.ref}`
    : `1-hour reminder, ${opts.ref}`

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
    ${badge}
    <p style="margin:18px 0 0;color:#0f1b33;font-size:15px">Hi ${opts.driverName},</p>
    <h2 style="color:#0f1b33;font-size:20px;font-weight:700;margin:14px 0 6px">${opts.ref}</h2>
    <p style="color:#0f1b33;font-size:14px;margin:0 0 24px">${headline}</p>
    ${infoCard(rows)}
    <p style="color:#475569;font-size:13px;margin:0 0 24px">${note}</p>
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
  const subject = `Job cancelled, ${opts.ref}`

  const rows = [
    { label: 'Passenger', value: opts.customer },
    ...(opts.time ? [{ label: 'Pickup time', value: opts.time }] : []),
    ...(opts.date ? [{ label: 'Date', value: opts.date }] : []),
    ...(opts.pickup ? [{ label: 'Pickup', value: opts.pickup }] : []),
  ]

  const html = base(subject, `
    ${pill('Cancelled', '#fee2e2', '#991b1b')}
    <p style="margin:18px 0 0;color:#0f1b33;font-size:15px">Hi ${opts.driverName},</p>
    <h2 style="color:#0f1b33;font-size:20px;font-weight:700;margin:14px 0 6px">${opts.ref}</h2>
    <p style="color:#0f1b33;font-size:14px;margin:0 0 24px">
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
  const subject = `Job updated, ${opts.ref}`

  const rows = [
    { label: 'Passenger', value: opts.customer },
    { label: 'Pickup time', value: opts.time },
    { label: 'Date', value: opts.date },
    { label: 'Pickup', value: opts.pickup },
    ...(opts.dropoff ? [{ label: 'Drop-off', value: opts.dropoff }] : []),
  ]

  const html = base(subject, `
    ${pill('Updated', '#dbeafe', '#1d4ed8')}
    <p style="margin:18px 0 0;color:#0f1b33;font-size:15px">Hi ${opts.driverName},</p>
    <h2 style="color:#0f1b33;font-size:20px;font-weight:700;margin:14px 0 6px">${opts.ref}</h2>
    <p style="color:#0f1b33;font-size:14px;margin:0 0 24px">
      Journey details for <strong>${opts.customer}</strong> have changed. Please review the updated information below.
    </p>
    ${infoCard(rows)}
    ${ctaButton('View Updated Job', opts.bookingUrl)}
  `)

  return { subject, html }
}
