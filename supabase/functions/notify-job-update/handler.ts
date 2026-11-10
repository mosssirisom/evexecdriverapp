// Driver "job cancelled" / "job updated" notice. Called only by the
// trg_notify_job_update trigger (notify_driver_job_update) when a booking with
// a driver is cancelled or its date, time, pickup, airport or drop-off changes.
//
// Delivery order:
//   1. Web push — free, instant.
//   2. Email fallback, queued for the website to send, when push can't be delivered.
//
// Security (audit H-1, 15/10/2026): the function is reachable from the
// internet (verify_jwt off), so it
//   1. refuses any request without the database trigger's shared secret, and
//   2. reads the booking (driver, status, customer, journey) from the
//      database by id. Only the previous values ("old_record", used to work
//      out what changed) come from the trigger's request.
// Dependencies are injected so this can be unit-tested with Node.

import { isTrustedTrigger, UUID_RE, type SecretLoader } from '../_shared/webhookAuth.ts'
import { cancellationEmail, updateEmail, stopsFromNotes } from '../_shared/email.ts'

export const CANCELLED_STATUSES = ['cancelled', 'Cancelled', 'canceled', 'Canceled']
const WATCH = ['travel_date', 'travel_time', 'pickup_location', 'airport', 'dropoff_address'] as const

export interface JobBooking {
  id: string
  ref: string | null
  status: string | null
  assigned_driver_id: string | null
  customer_name: string | null
  travel_date: string | null
  travel_time: string | null
  pickup_location: string | null
  airport: string | null
  dropoff_address: string | null
  notes: string | null
}

export interface JobUpdateDeps {
  appUrl: string
  loadWebhookSecret: SecretLoader
  loadBooking: (id: string) => Promise<JobBooking | null>
  pushToDriver: (p: {
    driverId: string; bookingId: string; type: 'job_cancelled' | 'job_updated'
    title: string; body: string; url: string; noEmailFallback: boolean
  }) => Promise<boolean>
  loadDriver: (id: string) => Promise<{ email: string | null; full_name: string | null } | null>
  queueEmail: (r: { bookingId: string; type: string; to: string; subject: string; html: string; body?: string }) => Promise<boolean>
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'Europe/London',
  })
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return ''
  return timeStr.slice(0, 5)
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export async function handleJobUpdate(req: Request, deps: JobUpdateDeps): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  if (!(await isTrustedTrigger(req.headers, deps.loadWebhookSecret))) {
    return json({ error: 'Unauthorized' }, 401)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const oldRecord = (body.old_record ?? {}) as Record<string, unknown>
  const bookingId = ((body.record ?? body) as Record<string, unknown>).id
  if (typeof bookingId !== 'string' || !UUID_RE.test(bookingId)) return json({ error: 'Invalid booking id' }, 400)

  const booking = await deps.loadBooking(bookingId)
  if (!booking) return json({ ok: true, skipped: 'booking not found' })
  const driverId = booking.assigned_driver_id
  if (!driverId) return json({ ok: true, skipped: 'no driver' })

  const ref        = booking.ref ?? bookingId.slice(0, 8).toUpperCase()
  const customer   = booking.customer_name ?? 'your passenger'
  const isCancelled = CANCELLED_STATUSES.includes(booking.status ?? '')
  const bookingUrl = `${deps.appUrl}/jobs/${bookingId}`

  let notifType: 'job_cancelled' | 'job_updated'
  let pushTitle: string
  let pushBody: string

  if (isCancelled) {
    notifType = 'job_cancelled'
    pushTitle = `Job cancelled, ${ref}`
    pushBody  = `Booking for ${customer} has been cancelled. Do not travel to the collection point.`
  } else {
    const current = booking as unknown as Record<string, unknown>
    const changed = WATCH.filter((f) => (oldRecord[f] ?? null) !== (current[f] ?? null))
    if (changed.length === 0) return json({ ok: true, skipped: 'no relevant change' })

    notifType = 'job_updated'
    // Use travel_time directly to avoid BST/UTC offset issues
    const time = formatTime(booking.travel_time)
    const date = formatDate(booking.travel_date)
    pushTitle = `Job updated, ${ref}`
    pushBody  = `${customer}${time ? ` · pickup at ${time}${date ? ` on ${date}` : ''}` : ''}. Tap to view updated details.`
  }

  // 1. Try push notification first
  const pushed = await deps.pushToDriver({
    driverId,
    bookingId,
    type:  notifType,
    title: pushTitle,
    body:  pushBody,
    url:   `/jobs/${bookingId}`,
    noEmailFallback: true, // the detailed email below is sent instead
  })
  if (pushed) return json({ ok: true, pushed: true, type: notifType })

  // 2. Email fallback
  const driver = await deps.loadDriver(driverId)
  if (!driver?.email) {
    console.warn(`[notify-job-update] no email for driver on booking ${bookingId}`)
    return json({ ok: true, pushed: false, skipped: 'no email' })
  }

  // The stored addresses are the source of truth; the airport name only
  // fills a side that has no address. Stops come from the booking's notes.
  const pickupAddr  = booking.pickup_location || booking.airport || ''
  const dropoffAddr = booking.dropoff_address || booking.airport || ''
  const stops = stopsFromNotes(booking.notes)

  const emailContent = isCancelled
    ? cancellationEmail({
        driverName: driver.full_name ?? 'Driver',
        ref, customer,
        date: formatDate(booking.travel_date),
        time: formatTime(booking.travel_time),
        pickup: pickupAddr,
        bookingUrl,
      })
    : updateEmail({
        driverName: driver.full_name ?? 'Driver',
        ref, customer,
        date: formatDate(booking.travel_date),
        time: formatTime(booking.travel_time),
        pickup: pickupAddr,
        dropoff: dropoffAddr,
        stops,
        bookingUrl,
      })

  const emailed = await deps.queueEmail({ bookingId, type: notifType, to: driver.email, ...emailContent, body: pushBody })
  return json({ ok: true, pushed: false, emailed, type: notifType })
}
