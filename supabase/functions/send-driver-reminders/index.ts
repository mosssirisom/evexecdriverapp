// Driver Reminder — push + email
//
// Invoked every minute by pg_cron + pg_net (see migration
// 20260622000000_driver_reminder_cron.sql for the scheduling setup).
//
// Notifies the assigned driver:
//   - 24 h before pickup_time  → type 'driver_reminder_24h' (push AND email)
//   - 1 h before pickup_time   → type 'driver_reminder_1h'  (push, email fallback)
//
// 24h reminder: both push and email are sent simultaneously so the driver
// receives the reminder in the live app AND their inbox.
// 1h reminder: push is primary; email is sent only when push fails.
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
      .select('id, ref, customer_name, pickup_location, airport, dropoff_address, journey_type, pickup_time, travel_date, travel_time, passengers, assigned_driver_id')
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
      // Use travel_time (stored as local UK time string) directly to avoid BST/UTC offset issues
      const time       = booking.travel_time
        ? (booking.travel_time as string).slice(0, 5)
        : formatTime(booking.pickup_time)
      const date       = formatDate(booking.travel_date ?? booking.pickup_time)
      const bookingUrl = `${APP_URL}/jobs/${booking.id}`
      const reminderType = reminder.type === 'driver_reminder_24h' ? '24h' : '1h' as const

      const jt = (booking.journey_type ?? '').toLowerCase()
      const isFromAirport = jt.includes('from') && jt.includes('airport')
      const pickup  = isFromAirport
        ? (booking.airport ?? booking.pickup_location ?? 'pickup point')
        : (booking.pickup_location ?? booking.airport ?? 'pickup point')
      const dropoff = isFromAirport
        ? (booking.dropoff_address ?? booking.airport ?? '')
        : (booking.dropoff_address ?? booking.airport ?? '')
      const passengers = booking.passengers ? String(booking.passengers) : undefined

      const pushTitle = reminder.type === 'driver_reminder_24h'
        ? `Reminder: job tomorrow — ${ref}`
        : `1-hour reminder — ${ref}`
      const pushBody = reminder.type === 'driver_reminder_24h'
        ? `${customer} · pickup at ${time}. Ensure your vehicle is clean and ready.`
        : `${customer} · pickup at ${time}. Make your way to the collection point now.`

      // 24h reminders: push AND email simultaneously
      // 1h reminders: push first, email fallback only if push fails
      const is24h = reminder.type === 'driver_reminder_24h'

      // Always send push
      const pushed = await pushToDriver(supabase, {
        driverId:  booking.assigned_driver_id,
        bookingId: booking.id,
        type:      reminder.type,
        title:     pushTitle,
        body:      pushBody,
        url:       `/jobs/${booking.id}`,
      })

      if (pushed) summary.pushed++

      // For 24h: always send email too. For 1h: email only if push failed.
      if (is24h || !pushed) {
        const { data: driver } = await supabase
          .from('drivers')
          .select('email, full_name')
          .eq('id', booking.assigned_driver_id)
          .maybeSingle()

        if (!driver?.email) {
          if (!pushed) {
            console.warn(`[${reminder.type}] no email for driver on booking ${booking.id}`)
            summary.skipped++
          }
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
        continue
      }
    }
  }

  console.log('[send-driver-reminders]', summary)
  return new Response(JSON.stringify({ ok: true, ...summary }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
