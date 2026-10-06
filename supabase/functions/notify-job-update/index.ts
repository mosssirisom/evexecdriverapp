// notify-job-update
//
// Triggered by a DB trigger whenever a booking's status changes to cancelled
// or key journey details (travel_date, travel_time, pickup_location, airport,
// dropoff_address) are changed while a driver is assigned.
//
// Delivery order:
//   1. Web push — free, instant.
//   2. Email fallback, queued for the website to send, when push can't be delivered.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { pushToDriver, queueEmail, type NotificationType } from '../_shared/notify.ts'
import { cancellationEmail, updateEmail, stopsFromNotes } from '../_shared/email.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? 'https://evexec.co.uk'

const CANCELLED_STATUSES = ['cancelled', 'Cancelled', 'canceled', 'Canceled']

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

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const oldRecord = (body.old_record ?? {}) as Record<string, unknown>
  const newRecord = (body.record ?? body) as Record<string, unknown>

  const driverId = newRecord.assigned_driver_id as string | undefined
  if (!driverId) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no driver' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const bookingId    = newRecord.id as string
  const ref          = (newRecord.ref as string) ?? bookingId.slice(0, 8).toUpperCase()
  const customer     = (newRecord.customer_name as string) ?? 'your passenger'
  const newStatus    = (newRecord.status as string) ?? ''
  const isCancelled  = CANCELLED_STATUSES.includes(newStatus)
  const bookingUrl   = `${APP_URL}/jobs/${bookingId}`

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  let notifType: NotificationType
  let pushTitle: string
  let pushBody: string

  if (isCancelled) {
    notifType = 'job_cancelled'
    pushTitle = `Job cancelled, ${ref}`
    pushBody  = `Booking for ${customer} has been cancelled. Do not travel to the collection point.`
  } else {
    const WATCH = ['travel_date', 'travel_time', 'pickup_location', 'airport', 'dropoff_address']
    const changed = WATCH.filter(f => oldRecord[f] !== newRecord[f])

    if (changed.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no relevant change' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    notifType = 'job_updated'
    // Use travel_time directly to avoid BST/UTC offset issues
    const time = formatTime(newRecord.travel_time as string | null)
    const date = formatDate(newRecord.travel_date as string | null)
    pushTitle = `Job updated, ${ref}`
    pushBody  = `${customer}${time ? ` · pickup at ${time}${date ? ` on ${date}` : ''}` : ''}. Tap to view updated details.`
  }

  // 1. Try push notification first
  const pushed = await pushToDriver(supabase, {
    driverId,
    bookingId,
    type:  notifType,
    title: pushTitle,
    body:  pushBody,
    url:   `/jobs/${bookingId}`,
    noEmailFallback: true, // the detailed email below is sent instead
  })

  if (pushed) {
    return new Response(JSON.stringify({ ok: true, pushed: true, type: notifType }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 2. Email fallback
  const { data: driver } = await supabase
    .from('drivers')
    .select('email, full_name')
    .eq('id', driverId)
    .maybeSingle()

  if (!driver?.email) {
    console.warn(`[notify-job-update] no email for driver on booking ${bookingId}`)
    return new Response(JSON.stringify({ ok: true, pushed: false, skipped: 'no email' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // The stored addresses are the source of truth; the airport name only
  // fills a side that has no address. Stops come from the booking's notes
  // (not in the trigger payload), in travel order.
  const pickupAddr  = (newRecord.pickup_location as string | null) || (newRecord.airport as string | null) || ''
  const dropoffAddr = (newRecord.dropoff_address as string | null) || (newRecord.airport as string | null) || ''
  const { data: full } = await supabase.from('bookings').select('notes').eq('id', bookingId).maybeSingle()
  const stops = stopsFromNotes(full?.notes)

  let emailContent: { subject: string; html: string }

  if (isCancelled) {
    emailContent = cancellationEmail({
      driverName: driver.full_name ?? 'Driver',
      ref,
      customer,
      date:   formatDate(newRecord.travel_date as string | null),
      time:   formatTime(newRecord.travel_time as string | null),
      pickup: pickupAddr,
      bookingUrl,
    })
  } else {
    emailContent = updateEmail({
      driverName: driver.full_name ?? 'Driver',
      ref,
      customer,
      date:    formatDate(newRecord.travel_date as string | null),
      time:    formatTime(newRecord.travel_time as string | null),
      pickup:  pickupAddr,
      dropoff: dropoffAddr,
      stops,
      bookingUrl,
    })
  }

  const emailed = await queueEmail(supabase, { bookingId, type: notifType, to: driver.email, ...emailContent, body: pushBody })

  return new Response(JSON.stringify({ ok: true, pushed: false, emailed, type: notifType }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
