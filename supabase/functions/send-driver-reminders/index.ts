// Driver Reminder — push + email
//
// Invoked every minute by pg_cron + pg_net (see migration
// 20260622000000_driver_reminder_cron.sql for the scheduling setup).
//
// Notifies the assigned driver:
//   - 24 h before pickup  → type 'driver_reminder_24h'
//   - 1 h before pickup   → type 'driver_reminder_1h'
// This is the only driver reminder (the database no longer queues its own).
//
// Delivery: push primary; if push fails or there's no subscription, the
// reminder email is queued for the website to send.
//
// Deduplication: checks notification_log before sending so that an extra
// invocation inside the same ±1-minute window never fires twice.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { pushToDriver, queueEmail, type NotificationType } from '../_shared/notify.ts'
import { reminderEmail, stopsFromNotes } from '../_shared/email.ts'

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

function formatDate(isoOrDate: string | null): string {
  if (!isoOrDate) return ''
  return new Date(isoOrDate).toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
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

// travel_date + travel_time are UK wall-clock values; this is the instant they
// happen (handles BST/GMT). Used when a booking has no pickup_time.
function ukWallClock(dateStr: string | null, timeStr: string | null): Date | null {
  const dm = String(dateStr ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  const tm = String(timeStr ?? '').match(/^(\d{1,2}):(\d{2})/)
  if (!dm || !tm) return null
  const guess = Date.UTC(+dm[1], +dm[2] - 1, +dm[3], +tm[1], +tm[2])
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/London', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(guess)).map((x) => [x.type, x.value]))
  return new Date(guess - (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - guess))
}

const dateOnly = (ms: number) => new Date(ms).toISOString().slice(0, 10)

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const summary: Record<string, number> = { pushed: 0, emailed: 0, skipped: 0, failed: 0 }

  for (const reminder of REMINDERS) {
    const target = Date.now() + reminder.offsetMs

    // Pickup instant: travel_date + travel_time (UK) when present, otherwise
    // pickup_time, so bookings without pickup_time are reminded too. Fetch a
    // +/- 1 day band by date and match the exact window in code.
    const { data: rows, error } = await supabase
      .from('bookings')
      .select('id, ref, customer_name, pickup_location, airport, dropoff_address, destination, notes, journey_type, pickup_time, travel_date, travel_time, passengers, assigned_driver_id')
      .in('status', ACTIVE_STATUSES)
      .not('assigned_driver_id', 'is', null)
      .gte('travel_date', dateOnly(target - 86_400_000))
      .lte('travel_date', dateOnly(target + 86_400_000))

    const bookings = (rows ?? []).filter((b) => {
      const at = (ukWallClock(b.travel_date, b.travel_time) ?? (b.pickup_time ? new Date(b.pickup_time) : null))?.getTime()
      return at != null && Math.abs(at - target) <= WINDOW_MS
    })

    if (error) {
      console.error(`[${reminder.type}] query error:`, error.message)
      continue
    }

    for (const booking of bookings) {
      // Deduplication guard — check notification_log (successful deliveries) AND
      // notification_queue (any attempt in the last 90 min, including failures).
      // Without the queue check, a failed push+email attempt leaves no log entry
      // and the reminder would re-fire every cron tick until one eventually succeeds.
      const [{ data: logEntry }, { data: queueEntry }] = await Promise.all([
        supabase
          .from('notification_log')
          .select('id')
          .eq('booking_id', booking.id)
          .eq('type', reminder.type)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('notification_queue')
          .select('id')
          .eq('booking_id', booking.id)
          .eq('type', reminder.type)
          .gte('created_at', new Date(Date.now() - 90 * 60_000).toISOString())
          .limit(1)
          .maybeSingle(),
      ])

      if (logEntry || queueEntry) {
        summary.skipped++
        continue
      }

      const ref        = booking.ref ?? booking.id.slice(0, 8).toUpperCase()
      const customer   = booking.customer_name ?? 'your passenger'
      // Use travel_time (stored as local UK time string) directly to avoid BST/UTC offset issues
      const time       = booking.travel_time
        ? (booking.travel_time as string).slice(0, 5)
        : formatTime(booking.pickup_time)
      const date       = formatDate(booking.travel_date ?? booking.pickup_time)
      const bookingUrl = `${APP_URL}/jobs/${booking.id}`
      const reminderType = reminder.type === 'driver_reminder_24h' ? '24h' : '1h' as const

      // The stored addresses are the source of truth; the airport name only
      // fills a side that has no address.
      const pickup  = booking.pickup_location || booking.airport || 'pickup point'
      const dropoff = booking.dropoff_address || booking.airport || booking.destination || ''
      const passengers = booking.passengers ? String(booking.passengers) : undefined

      const pushTitle = reminder.type === 'driver_reminder_24h'
        ? `Reminder: job tomorrow, ${ref}`
        : `1-hour reminder, ${ref}`
      const pushBody = reminder.type === 'driver_reminder_24h'
        ? `${customer} · pickup at ${time} on ${date}. Ensure your vehicle is clean and ready.`
        : `${customer} · pickup at ${time} on ${date}. Make your way to the collection point now.`

      // Push primary; email fallback if push fails or no subscription
      const pushed = await pushToDriver(supabase, {
        driverId:  booking.assigned_driver_id,
        bookingId: booking.id,
        type:      reminder.type,
        title:     pushTitle,
        body:      pushBody,
        // The 24 h reminder opens the job with the customer reminder action ready.
        url:       reminder.type === 'driver_reminder_24h' ? `/jobs/${booking.id}?reminder=24hr` : `/jobs/${booking.id}`,
        noEmailFallback: true, // the detailed reminder email below is sent instead
      })

      if (pushed) {
        summary.pushed++
        continue
      }

      // Email fallback — fetch driver email
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
        pickup,
        dropoff,
        date,
        time,
        passengers,
        stops: stopsFromNotes(booking.notes),
        type: reminderType,
        bookingUrl,
      })

      const queued = await queueEmail(supabase, { bookingId: booking.id, type: reminder.type, to: driver.email, subject, html, body: pushBody })
      queued ? summary.emailed++ : summary.failed++
    }
  }

  console.log('[send-driver-reminders]', summary)
  return new Response(JSON.stringify({ ok: true, ...summary }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
