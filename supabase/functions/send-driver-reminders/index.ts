// Driver Reminder SMS
//
// Invoked every minute by pg_cron + pg_net (see migration
// 20260622000000_driver_reminder_cron.sql for the scheduling setup).
//
// Sends an SMS (+ WhatsApp fallback) to the assigned driver:
//   - 24 h before pickup_time  → type 'driver_reminder_24h'
//   - 1 h before pickup_time   → type 'driver_reminder_1h'
//
// Deduplication: checks notification_log before sending so that an extra
// invocation inside the same ±1-minute window never fires twice.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendSms, sendWhatsApp } from '../_shared/twilio.ts'
import { recordNotification, pushToDriver, type NotificationType } from '../_shared/notify.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

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
  smsBody: (opts: { ref: string; customer: string; route: string; time: string }) => string
}

// Build a clear route description that shows direction relative to airport
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

  // Point-to-point or unknown type — just show from/to if available
  const from = opts.pickup_location ?? opts.airport ?? 'pickup point'
  const to   = opts.dropoff_address ?? opts.airport
  return to ? `${from} → ${to}` : `from ${from}`
}

const REMINDERS: ReminderConfig[] = [
  {
    type: 'driver_reminder_24h',
    offsetMs: 24 * 3600_000,
    smsBody: ({ ref, customer, route, time }) =>
      `EV Exec: Job reminder – tomorrow's pickup at ${time}. ` +
      `Ref ${ref}: ${customer}. ${route}. ` +
      `Please ensure your vehicle is clean and ready. Open the driver app for full details.`,
  },
  {
    type: 'driver_reminder_1h',
    offsetMs: 1 * 3600_000,
    smsBody: ({ ref, customer, route, time }) =>
      `EV Exec: 1-hour reminder – pickup at ${time}. ` +
      `Ref ${ref}: ${customer}. ${route}. ` +
      `Please make your way to the collection point now.`,
  },
]

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
  const summary: Record<string, number> = { sent: 0, skipped: 0, failed: 0 }

  for (const reminder of REMINDERS) {
    const windowStart = new Date(Date.now() + reminder.offsetMs - WINDOW_MS).toISOString()
    const windowEnd   = new Date(Date.now() + reminder.offsetMs + WINDOW_MS).toISOString()

    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('id, ref, customer_name, pickup_location, airport, dropoff_address, journey_type, pickup_time, assigned_driver_id')
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

      // Fetch driver phone
      const { data: driver } = await supabase
        .from('drivers')
        .select('phone, full_name')
        .eq('id', booking.assigned_driver_id)
        .maybeSingle()

      if (!driver?.phone) {
        console.warn(`[${reminder.type}] no phone for driver on booking ${booking.id}`)
        summary.skipped++
        continue
      }

      const msgBody = reminder.smsBody({
        ref:      booking.ref ?? booking.id.slice(0, 8).toUpperCase(),
        customer: booking.customer_name ?? 'your passenger',
        route:    buildRoute(booking),
        time:     formatTime(booking.pickup_time),
      })

      // Try push first (free, instant)
      const pushed = await pushToDriver(supabase, {
        driverId:  booking.assigned_driver_id,
        bookingId: booking.id,
        type:      reminder.type,
        title:     reminder.type === 'driver_reminder_24h'
          ? `Reminder: job tomorrow — ${booking.ref ?? booking.id.slice(0, 8).toUpperCase()}`
          : `1-hour reminder — ${booking.ref ?? booking.id.slice(0, 8).toUpperCase()}`,
        body:      msgBody,
        url:       `/jobs/${booking.id}`,
      })

      if (pushed) {
        summary.sent++
        continue
      }

      // SMS fallback when driver has no push subscription
      const sms = await sendSms(driver.phone, msgBody)

      await recordNotification(supabase, {
        bookingId: booking.id,
        type:      reminder.type,
        channel:   'sms',
        recipient: driver.phone,
        body:      msgBody,
        delivered:        sms.ok,
        providerMessageId: sms.sid,
        error:             sms.error,
      })

      // WhatsApp fallback if SMS also failed
      if (!sms.ok) {
        const wa = await sendWhatsApp(driver.phone, msgBody)
        await recordNotification(supabase, {
          bookingId: booking.id,
          type:      reminder.type,
          channel:   'whatsapp',
          recipient: driver.phone,
          body:      msgBody,
          delivered:        wa.ok,
          providerMessageId: wa.sid,
          error:             wa.error,
        })
        wa.ok ? summary.sent++ : summary.failed++
      } else {
        summary.sent++
      }
    }
  }

  console.log('[send-driver-reminders]', summary)
  return new Response(JSON.stringify({ ok: true, ...summary }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
