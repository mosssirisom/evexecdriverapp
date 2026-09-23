// Customer SMS reminder handoff — push notify the driver.
//
// Invoked every minute by pg_cron + pg_net (see migration
// 20260923000000_customer_sms_reminder_push_cron.sql).
//
// evexec's reminder cron (api/reminders/trigger.js) no longer sends the
// customer's 7-day / 24-hour reminder SMS via Twilio when the customer has
// no email on file. Instead it writes a row to driver_sms_reminders with
// the fully generated message and status='pending'. This function's only
// job is to notice new pending rows and push-notify the assigned driver,
// deep-linking to the reminder screen where they review the message and
// send it themselves from their own phone via the native Messages app.
//
// The message itself is generated once, by evexec, and stored on the row --
// this function never regenerates or sends the SMS text; it only notifies.
//
// Push-sending logic below is intentionally identical to
// supabase/functions/_shared/notify.ts's pushToDriver/recordNotification
// (that shared module's relative import path doesn't bundle cleanly
// through this deploy path, so it's inlined here rather than reworking the
// shared module's resolution for every function that uses it).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
// @ts-ignore - no type declarations published for this package
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const RECEIPT_FROM = Deno.env.get('RECEIPT_FROM') ?? 'EV Exec <receipts@evexec.co.uk>'
const APP_URL = Deno.env.get('APP_URL') ?? 'https://evexec.co.uk'
const LOGO_URL = `${APP_URL}/logo.png`

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:driver@evexec.co.uk', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

async function recordNotification(supabase: SupabaseClient, params: {
  bookingId: string | null
  channel: 'push' | 'email'
  recipient: string
  body: string
  delivered: boolean
  error?: string
}): Promise<void> {
  await supabase.from('notification_queue').insert({
    booking_id: params.bookingId,
    type: 'customer_sms_reminder',
    channel: params.channel,
    recipient: params.recipient,
    body: params.body,
    status: params.delivered ? 'sent' : 'failed',
    delivery_status: params.delivered ? 'sent' : 'failed',
    attempts: 1,
    sent_at: params.delivered ? new Date().toISOString() : null,
    last_error: params.error ?? null,
  })

  if (params.delivered && params.bookingId) {
    await supabase.from('notification_log').insert({
      booking_id: params.bookingId,
      type: 'customer_sms_reminder',
      channel: params.channel,
      recipient: params.recipient,
      sent_at: new Date().toISOString(),
    })
  }
}

function driverEmailHtml(title: string, body: string, jobUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <div style="background:#060C1A;padding:24px 32px;text-align:center">
      <img src="${LOGO_URL}" alt="EV Exec" width="48" height="48"
           style="display:block;margin:0 auto 10px;border-radius:8px" />
      <div style="color:#d5a538;font-size:18px;font-weight:700;letter-spacing:2px">EV EXEC</div>
      <div style="color:rgba(255,255,255,0.4);font-size:10px;letter-spacing:3px;margin-top:4px;text-transform:uppercase">Driver Notification</div>
    </div>
    <div style="padding:32px">
      <h2 style="color:#111827;font-size:17px;font-weight:700;margin:0 0 12px">${title}</h2>
      <p style="color:#374151;font-size:14px;margin:0 0 24px;line-height:1.6">${body}</p>
      <a href="${APP_URL}${jobUrl}"
         style="display:inline-block;background:linear-gradient(135deg,#f1c56a,#d5a538 55%,#a97918);color:#020813;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none">
        View Reminder
      </a>
    </div>
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
      <p style="color:#9ca3af;font-size:12px;margin:0;text-align:center">EV Exec · support@evexec.co.uk</p>
    </div>
  </div>
</body>
</html>`
}

async function sendEmailToDriver(
  supabase: SupabaseClient,
  driverId: string,
  bookingId: string,
  title: string,
  body: string,
  url: string,
): Promise<boolean> {
  if (!RESEND_API_KEY) return false

  const { data: driver } = await supabase
    .from('drivers')
    .select('email, full_name')
    .eq('id', driverId)
    .single()

  if (!driver?.email) {
    await recordNotification(supabase, {
      bookingId, channel: 'email', recipient: driverId, body,
      delivered: false, error: 'No email address on driver record',
    })
    return false
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: RECEIPT_FROM,
      to: driver.email,
      subject: title,
      html: driverEmailHtml(title, body, url),
    }),
  })

  await recordNotification(supabase, {
    bookingId, channel: 'email', recipient: driver.email, body,
    delivered: res.ok, error: res.ok ? undefined : `Resend HTTP ${res.status}`,
  })

  return res.ok
}

/** Sends a high-priority web push to every subscription registered by the driver.
 *  Falls back to email if no subscription exists or all push deliveries fail. */
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
    await recordNotification(supabase, {
      bookingId: params.bookingId, channel: 'push', recipient: params.driverId,
      body: params.body, delivered: false, error: 'No push subscription registered for driver',
    })
    return sendEmailToDriver(supabase, params.driverId, params.bookingId, params.title, params.body, params.url)
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    await recordNotification(supabase, {
      bookingId: params.bookingId, channel: 'push', recipient: params.driverId,
      body: params.body, delivered: false, error: 'VAPID keys not configured',
    })
    return sendEmailToDriver(supabase, params.driverId, params.bookingId, params.title, params.body, params.url)
  }

  const payload = JSON.stringify({
    title: params.title,
    body: params.body,
    url: params.url,
    icon: '/logo.png',
    badge: '/logo.png',
    requireInteraction: true,
  })

  const results = await Promise.allSettled(
    subs.map((sub: { endpoint: string; p256dh: string; auth_key: string }) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        payload
      )
    )
  )

  const expired = subs.filter((_sub: unknown, i: number) => {
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

  await recordNotification(supabase, {
    bookingId: params.bookingId, channel: 'push', recipient: params.driverId, body: params.body,
    delivered, error: delivered ? undefined : (failureDetail || 'All push subscriptions failed'),
  })

  if (!delivered) {
    return sendEmailToDriver(supabase, params.driverId, params.bookingId, params.title, params.body, params.url)
  }

  return true
}

function formatTime(timeStr: string | null): string {
  return timeStr ? timeStr.slice(0, 5) : ''
}

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const summary = { pushed: 0, failed: 0 }

  const { data: pending, error } = await supabase
    .from('driver_sms_reminders')
    .select('id, booking_id, driver_id, reminder_type, customer_name, travel_time')
    .eq('status', 'pending')
    .is('pushed_at', null)
    .limit(50)

  if (error) {
    console.error('[send-customer-sms-reminder-push] query error:', error.message)
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  for (const row of pending ?? []) {
    const name = row.customer_name || 'Customer'
    const time = formatTime(row.travel_time)

    const pushed = await pushToDriver(supabase, {
      driverId: row.driver_id,
      bookingId: row.booking_id,
      title: 'Customer reminder due',
      body: time ? `${name} — ${time}` : name,
      url: `/jobs/${row.booking_id}/reminder?type=${row.reminder_type}`,
    })

    await supabase
      .from('driver_sms_reminders')
      .update({ pushed_at: new Date().toISOString() })
      .eq('id', row.id)

    pushed ? summary.pushed++ : summary.failed++
  }

  console.log('[send-customer-sms-reminder-push]', summary)
  return new Response(JSON.stringify({ ok: true, ...summary }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
