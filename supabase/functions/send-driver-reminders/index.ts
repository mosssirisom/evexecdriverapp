// Driver Reminder — push + email
//
// Invoked every minute by pg_cron + pg_net (see migration
// 20260622000000_driver_reminder_cron.sql for the scheduling setup).
//
// Notifies the assigned driver:
//   - 24 h before pickup_time  → type 'driver_reminder_24h'
//   - 1 h before pickup_time   → type 'driver_reminder_1h'
//
// Delivery order:
//   1. Web push (free, instant) — uses the driver's registered push subscription.
//   2. Email fallback via Resend — used when no push subscription is registered.
//
// Deduplication: checks notification_log before sending so that an extra
// invocation inside the same ±1-minute window never fires twice.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { recordNotification, pushToDriver, type NotificationType } from '../_shared/notify.ts'
import { sendEmail, reminderEmail } from '../_shared/email.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? 'https://evexec.co.uk'

// Booking statuses that can still have upcoming pickups
const ACTIVE_STATUSES = [
  'accepted', 'confirmed', 'Dispatched',
  'En Route', 'en_route', 'Active', 'active',
]

// ±60-second window around the target offset (catches one cron tick)
const WINDOW_MS = 60_000

interface ReminderConfig {
  type: NotificationType
  offsetMs: number
}

const REMINDERS: ReminderConfig[] = [
  { type: 'driver_reminder_24h', offsetMs: 24 * 3600_000 },
  { type: 'driver_reminder_1h',  offsetMs: 1 * 3600_000 },
]

function buildRoute(opts: {
  journey_type: string | null
  pickup_location: string | null
  airport: string | null
  dropoff_address: string | null
}): string {
  const jt = (opts.journey_type ?? '').toLowerCase()
  const isToAirport   = jt.includes('to') && jt.includes('airport')
  const isFromAirport = jt.includes('from') && jt.includes('airport')

  if (isToAirport) {
    const from = opts.pickup_location ?? 'pickup address'
    const to   = opts.airport ?? 'airport'
    return `TO AIRPORT: ${from} → ${to}`
  }
  if (isFromAirport) {
    const from = opts.airport ?? 'airport'
    const to   = opts.dropoff_address ?? 'drop-off address'
    return `FROM AIRPORT: ${from} → ${to}`
  }

  const from = opts.pickup_location ?? opts.airport ?? 'pickup point'
  const to   = opts.dropoff_address ?? opts.airport
  return to ? `${from} → ${to}` : `from ${from}`
}

function formatDate(isoOrDate: string | null): string {
  if (!isoOrDate) return ''
  return new Date(isoOrDate).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    timeZone: 'Europe/London',
  })
}

function formatTime(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
    hour12: false,
  })
}

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const summary: Record<string, number> = { pushed: 0, emailed: 0, skipped: 0, failed: 0 }

  for (const reminder of REMINDERS) {
    const windowStart = new Date(Date.now() + reminder.offsetMs - WINDOW_MS).toISOString()
    const windowEnd   = new Date(Date.now() + reminder.offsetMs + WINDOW_MS).toISOString()

    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('id, ref, customer_name, pickup_location, airport, dropoff_address, journey_type, pickup_time, travel_date, assigned_driver_id')
      .in('status', ACTIVE_STATUSES)
      .not('assigned_driver_id', 'is', null)
      .not('pickup_time', 'is', null)
      .gte('pickup_time', windowStart)
      .lte('pickup_time', windowEnd)

    if (error) {
      console.error(`[${reminder.type}] query error:`, error.message)
      continue
    }

    for (const booking of (bookings ?? [])) {
      // Deduplication guard
      const { data: alreadySent } = await supabase
        .from('notification_log')
        .select('id')
        .eq('booking_id', booking.id)
        .eq('type', reminder.type)
        .limit(1)
        .maybeSingle()

      if (alreadySent) {
        summary.skipped++
        continue
      }

      const ref        = booking.ref ?? booking.id.slice(0, 8).toUpperCase()
      const customer   = booking.customer_name ?? 'your passenger'
      const route      = buildRoute(booking)
      const time       = formatTime(booking.pickup_time)
      const date       = formatDate(booking.travel_date ?? booking.pickup_time)
      const bookingUrl = `${APP_URL}/jobs/${booking.id}`
      const reminderType = reminder.type === 'driver_reminder_24h' ? '24h' : '1h' as const

      const pushTitle = reminder.type === 'driver_reminder_24h'
        ? `Reminder: job tomorrow — ${ref}`
        : `1-hour reminder — ${ref}`
      const pushBody = reminder.type === 'driver_reminder_24h'
        ? `${customer} · pickup at ${time}. Ensure your vehicle is clean and ready.`
        : `${customer} · pickup at ${time}. Make your way to the collection point now.`

      // 1. Try push notification first
      const pushed = await pushToDriver(supabase, {
        driverId:  booking.assigned_driver_id,
        bookingId: booking.id,
        type:      reminder.type,
        title:     pushTitle,
        body:      pushBody,
        url:       `/jobs/${booking.id}`,
      })

      if (pushed) {
        summary.pushed++
        continue
      }

      // 2. Email fallback — fetch driver email
      const { data: driver } = await supabase
        .from('drivers')
        .select('email, full_name')
        .eq('id', booking.assigned_driver_id)
        .maybeSingle()

      if (!driver?.email) {
        console.warn(`[${reminder.type}] no email for driver on booking ${booking.id}`)
        summary.skipped++
        continue
      }

      const { subject, html } = reminderEmail({
        driverName: driver.full_name ?? 'Driver',
        ref,
        customer,
        route,
        date,
        time,
        type: reminderType,
        bookingUrl,
      })

      const result = await sendEmail({ to: driver.email, subject, html })

      await recordNotification(supabase, {
        bookingId: booking.id,
        type:      reminder.type,
        channel:   'email',
        recipient: driver.email,
        body:      pushBody,
        delivered: result.ok,
        providerMessageId: result.id,
        error:     result.error,
      })

      result.ok ? summary.emailed++ : summary.failed++
    }
  }

  console.log('[send-driver-reminders]', summary)
  return new Response(JSON.stringify({ ok: true, ...summary }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
