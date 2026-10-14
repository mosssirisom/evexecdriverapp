// Customer SMS reminder handoff: push-notify the driver.
//
// Invoked every minute by pg_cron + pg_net (migration
// 20260923000000_customer_sms_reminder_push_cron.sql).
//
// The website's reminder cron (evexec api/reminders/trigger.js) writes a
// driver_sms_reminders row (status 'pending') for every customer with a phone
// number: '7day' 5-7 days before travel and '24hr' the day before. This
// function notices new rows and push-notifies the assigned driver, opening the
// job with that reminder ready to send from their own phone (two taps).
//
// The push says which customer and when the job is (day, date, time), so the
// driver knows what it is without opening it.
//
// If the push can't reach the driver's phone:
//   - '24hr': a backup email is queued. The website sends it in the shared
//     email design (evexec lib/emailQueueRender.js, type customer_sms_reminder),
//     with the job's date and time and the exact text to send.
//   - '7day' and anything else: no email (user decision, 14/10/2026). The
//     reminder is still waiting in the app, and the day-before one follows.
//
// Dates DD/MM/YYYY, times 24-hour HH:MM, UK time.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
// @ts-ignore - no type declarations published for this package
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:driver@evexec.co.uk', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** "Thursday 15/10/2026" from a plain YYYY-MM-DD date (no timezone shift). */
function longDate(d: string | null): string {
  const m = String(d ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ''
  const day = WEEKDAYS[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()]
  return `${day} ${m[3]}/${m[2]}/${m[1]}`
}
function hhmm(t: string | null): string {
  const m = String(t ?? '').match(/^(\d{1,2}):(\d{2})/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''
}

async function recordNotification(supabase: SupabaseClient, params: {
  bookingId: string | null
  recipient: string
  body: string
  delivered: boolean
  error?: string
}): Promise<void> {
  // Log row only: status is final ('sent' / 'failed') and nothing schedules it.
  await supabase.from('notification_queue').insert({
    booking_id: params.bookingId,
    type: 'customer_sms_reminder',
    channel: 'push',
    recipient: params.recipient,
    body: params.body,
    status: params.delivered ? 'sent' : 'failed',
    delivery_status: params.delivered ? 'sent' : 'failed',
    attempts: 1,
    sent_at: params.delivered ? new Date().toISOString() : null,
    next_attempt_at: null,
    last_error: params.error ?? null,
  })
  if (params.delivered && params.bookingId) {
    await supabase.from('notification_log').insert({
      booking_id: params.bookingId,
      type: 'customer_sms_reminder',
      channel: 'push',
      recipient: params.recipient,
      sent_at: new Date().toISOString(),
    })
  }
}

/** Day-before backup email: queued for the website, which renders and sends it. */
async function queueBackupEmail(supabase: SupabaseClient, driverId: string, bookingId: string, summary: string): Promise<boolean> {
  const { data: driver } = await supabase.from('drivers').select('email').eq('id', driverId).single()
  const email = (driver?.email ?? '').trim()
  if (!email) return false
  const { error } = await supabase.from('notification_queue').insert({
    booking_id: bookingId,
    type: 'customer_sms_reminder',
    channel: 'email',
    recipient: email,
    // The website replaces subject and HTML with the current design when it sends.
    subject: `Customer reminder to send: ${summary}`,
    body: `Customer reminder to send: ${summary}. Open the job in the driver app to send it.`,
    html: null,
    status: 'pending',
    attempts: 0,
    next_attempt_at: new Date().toISOString(),
  })
  if (error) console.error('[send-customer-sms-reminder-push] queue email:', error.message)
  return !error
}

/** High-priority web push to every device the driver has registered. */
async function pushToDriver(supabase: SupabaseClient, params: {
  driverId: string
  bookingId: string
  title: string
  body: string
  url: string
}): Promise<boolean> {
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .eq('driver_id', params.driverId)

  if (!subs || subs.length === 0) {
    await recordNotification(supabase, { bookingId: params.bookingId, recipient: params.driverId, body: params.body, delivered: false, error: 'No push subscription registered for driver' })
    return false
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    await recordNotification(supabase, { bookingId: params.bookingId, recipient: params.driverId, body: params.body, delivered: false, error: 'VAPID keys not configured' })
    return false
  }

  const payload = JSON.stringify({ title: params.title, body: params.body, url: params.url, icon: '/logo.png', badge: '/logo.png', requireInteraction: true })
  const results = await Promise.allSettled(
    subs.map((sub: { endpoint: string; p256dh: string; auth_key: string }) =>
      webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload)),
  )

  const expired = subs.filter((_s: unknown, i: number) => {
    const r = results[i]
    return r.status === 'rejected' && (r as PromiseRejectedResult).reason?.statusCode === 410
  })
  if (expired.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', expired.map((s: { id: string }) => s.id))
  }

  const delivered = results.some((r) => r.status === 'fulfilled')
  const failureDetail = results
    .map((r, i) => {
      if (r.status !== 'rejected') return null
      const reason = (r as PromiseRejectedResult).reason
      const code = reason?.statusCode ?? reason?.status ?? '?'
      const body = typeof reason?.body === 'string' ? reason.body.slice(0, 200) : (reason?.message ?? String(reason))
      return `[${i}] HTTP ${code}: ${body}`
    })
    .filter(Boolean)
    .join(' | ')

  await recordNotification(supabase, { bookingId: params.bookingId, recipient: params.driverId, body: params.body, delivered, error: delivered ? undefined : (failureDetail || 'All push subscriptions failed') })
  return delivered
}

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const summary = { pushed: 0, emailed: 0, failed: 0 }

  const { data: pending, error } = await supabase
    .from('driver_sms_reminders')
    .select('id, booking_id, driver_id, reminder_type, customer_name, travel_date, travel_time')
    .eq('status', 'pending')
    .is('pushed_at', null)
    .limit(50)

  if (error) {
    console.error('[send-customer-sms-reminder-push] query error:', error.message)
    return new Response(JSON.stringify({ ok: false, error: error.message }), { headers: { 'Content-Type': 'application/json' } })
  }

  for (const row of pending ?? []) {
    const name = (row.customer_name ?? '').trim() || 'Customer'
    const whenText = [longDate(row.travel_date), hhmm(row.travel_time)].filter(Boolean).join(' at ')
    const week = row.reminder_type === '7day'
    const type = row.reminder_type === '7day' || row.reminder_type === '24hr' ? row.reminder_type : null

    const pushed = await pushToDriver(supabase, {
      driverId: row.driver_id,
      bookingId: row.booking_id,
      title: week ? `Week-ahead reminder for ${name}` : `Text ${name} their reminder`,
      body: whenText ? `Job ${whenText}. Tap, then press Send.` : 'Tap, then press Send.',
      url: type ? `/jobs/${row.booking_id}?reminder=${type}` : `/jobs/${row.booking_id}`,
    })

    let emailed = false
    if (!pushed && row.reminder_type === '24hr') {
      emailed = await queueBackupEmail(supabase, row.driver_id, row.booking_id, `${name}, job ${whenText}`)
    }

    await supabase.from('driver_sms_reminders').update({ pushed_at: new Date().toISOString() }).eq('id', row.id)

    if (pushed) summary.pushed++
    else if (emailed) summary.emailed++
    else summary.failed++
  }

  console.log('[send-customer-sms-reminder-push]', summary)
  return new Response(JSON.stringify({ ok: true, ...summary }), { headers: { 'Content-Type': 'application/json' } })
})
