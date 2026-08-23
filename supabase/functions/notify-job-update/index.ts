// notify-job-update
//
// Triggered by a DB trigger whenever a booking's status changes to cancelled
// or key journey details (travel_date, travel_time, pickup_location, airport,
// dropoff_address) are changed while a driver is assigned.
//
// Sends a push notification to the assigned driver.
// Falls back to SMS for cancellations (critical, driver must know).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { pushToDriver, recordNotification, type NotificationType } from '../_shared/notify.ts'
import { sendSms } from '../_shared/twilio.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CANCELLED_STATUSES = ['cancelled', 'Cancelled', 'canceled', 'Canceled']

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    timeZone: 'Europe/London',
  })
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return ''
  // travel_time is stored as HH:MM or HH:MM:SS
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

  const bookingId = newRecord.id as string
  const ref = (newRecord.ref as string) ?? bookingId.slice(0, 8).toUpperCase()
  const customerName = (newRecord.customer_name as string) ?? 'your passenger'
  const newStatus = (newRecord.status as string) ?? ''
  const isCancelled = CANCELLED_STATUSES.includes(newStatus)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  let notifType: NotificationType
  let pushTitle: string
  let pushBody: string
  let smsFallback = false

  if (isCancelled) {
    notifType = 'job_cancelled'
    pushTitle = `Job cancelled — ${ref}`
    pushBody = `Booking for ${customerName} has been cancelled. Open the app for details.`
    smsFallback = true
  } else {
    // Detail change — determine what changed
    const changedFields: string[] = []
    const WATCH = ['travel_date', 'travel_time', 'pickup_location', 'airport', 'dropoff_address']
    for (const f of WATCH) {
      if (oldRecord[f] !== newRecord[f]) changedFields.push(f)
    }

    if (changedFields.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no relevant change' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    notifType = 'job_updated'
    const date = formatDate(newRecord.travel_date as string | null)
    const time = formatTime(newRecord.travel_time as string | null)
    pushTitle = `Job updated — ${ref}`
    pushBody = `${customerName}${date ? ` · ${date}` : ''}${time ? ` at ${time}` : ''}. Tap to view new details.`
  }

  // Send push notification
  const pushed = await pushToDriver(supabase, {
    driverId,
    bookingId,
    type: notifType,
    title: pushTitle,
    body: pushBody,
    url: `/jobs/${bookingId}`,
  })

  // SMS fallback for cancellations (critical — driver must know even with no push)
  if (smsFallback && !pushed) {
    const { data: driver } = await supabase
      .from('drivers')
      .select('phone')
      .eq('id', driverId)
      .maybeSingle()

    if (driver?.phone) {
      const smsBody = `EV Exec: Job CANCELLED – Ref ${ref} (${customerName}) has been cancelled. Log in to the driver app for details.`
      const sms = await sendSms(driver.phone, smsBody)
      await recordNotification(supabase, {
        bookingId,
        type: notifType,
        channel: 'sms',
        recipient: driver.phone,
        body: smsBody,
        delivered: sms.ok,
        providerMessageId: sms.sid,
        error: sms.error,
      })
    }
  }

  return new Response(JSON.stringify({ ok: true, pushed, type: notifType }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
