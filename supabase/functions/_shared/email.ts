// Thin Resend email client shared across edge functions.
//
// Uses the same RESEND_API_KEY and RECEIPT_FROM already configured for
// send-journey-receipt. Falls back to ok:false gracefully when credentials
// are not configured so functions can be deployed and tested without email.

import { emailLayout, emailRow, emailPill, emailButton, emailLead } from './emailLayout.ts'

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
// Same shell/palette as every other email in the system (see _shared/emailLayout.ts).

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
    ? emailPill('Tomorrow', '#fef3c7', '#92400e')
    : emailPill('1 Hour', '#fee2e2', '#991b1b')

  const headline = opts.type === '24h'
    ? `Hi ${opts.driverName}, you have a job tomorrow at ${opts.time}.`
    : `Hi ${opts.driverName}, your pickup is in 1 hour at ${opts.time}.`

  const note = opts.type === '24h'
    ? 'Please ensure your vehicle is clean, fuelled and ready to go.'
    : 'Please make your way to the collection point now.'

  const body = [
    badge,
    emailLead(headline),
    emailRow('Passenger', opts.customer),
    emailRow('Pickup Time', opts.time),
    emailRow('Date', opts.date),
    emailRow('Pickup', opts.pickup),
    emailRow('Drop-off', opts.dropoff ?? ''),
    emailRow('Passengers', opts.passengers ?? '', true),
    emailLead(note),
    emailButton(opts.bookingUrl, 'View Job Details'),
  ].filter(Boolean).join('')

  const html = emailLayout({ title: opts.ref, body })

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

  const body = [
    emailPill('Cancelled', '#fee2e2', '#991b1b'),
    emailLead(`Hi ${opts.driverName}, the booking for ${opts.customer} has been cancelled. Please do not travel to the collection point.`),
    emailRow('Passenger', opts.customer),
    emailRow('Pickup Time', opts.time ?? ''),
    emailRow('Date', opts.date ?? ''),
    emailRow('Pickup', opts.pickup ?? '', true),
    emailButton(opts.bookingUrl, 'View Booking'),
  ].filter(Boolean).join('')

  const html = emailLayout({ title: opts.ref, body, accent: '#374151', accentText: '#fff' })

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

  const body = [
    emailPill('Updated', '#dbeafe', '#1d4ed8'),
    emailLead(`Hi ${opts.driverName}, journey details for ${opts.customer} have changed — please review the updated information below.`),
    emailRow('Passenger', opts.customer),
    emailRow('Pickup Time', opts.time),
    emailRow('Date', opts.date),
    emailRow('Pickup', opts.pickup),
    emailRow('Drop-off', opts.dropoff ?? '', true),
    emailButton(opts.bookingUrl, 'View Updated Job'),
  ].filter(Boolean).join('')

  const html = emailLayout({ title: opts.ref, body })

  return { subject, html }
}
