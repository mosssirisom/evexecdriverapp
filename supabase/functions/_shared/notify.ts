// Notification helpers shared by the attestation engine.
//
// Push delivery uses VAPID web-push. Email (Resend) is the fallback when the
// driver has no push subscription or all push deliveries fail. Every attempt
// is recorded in `notification_queue` for audit/retry visibility.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
// @ts-ignore - no type declarations published for this package
import webpush from 'npm:web-push@3.6.7'

const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY') ?? ''
const RECEIPT_FROM      = Deno.env.get('RECEIPT_FROM') ?? 'EV Exec <receipts@evexec.co.uk>'
const APP_URL           = Deno.env.get('APP_URL') ?? 'https://evexec.co.uk'
const LOGO_URL          = `${APP_URL}/logo.png`

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:driver@evexec.co.uk', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

export type NotificationType =
  | 'attestation_first'
  | 'attestation_second_urgent'
  | 'attestation_reallocated'
  | 'operator_panic'
  | 'driver_reminder_24h'
  | 'driver_reminder_1h'
  | 'job_assigned'
  | 'job_cancelled'
  | 'job_updated'

export type NotificationChannel = 'push' | 'sms' | 'whatsapp' | 'voice' | 'email'

export interface RecordNotificationParams {
  bookingId: string | null
  type: NotificationType
  channel: NotificationChannel
  recipient: string
  body: string
  delivered: boolean
  providerMessageId?: string
  error?: string
}

/** Records a notification attempt for audit/retry visibility. */
export async function recordNotification(supabase: SupabaseClient, params: RecordNotificationParams): Promise<void> {
  await supabase.from('notification_queue').insert({
    booking_id: params.bookingId,
    type: params.type,
    channel: params.channel,
    recipient: params.recipient,
    body: params.body,
    status: params.delivered ? 'sent' : 'failed',
    delivery_status: params.delivered ? 'sent' : 'failed',
    provider_message_id: params.providerMessageId ?? null,
    attempts: 1,
    sent_at: params.delivered ? new Date().toISOString() : null,
    last_error: params.error ?? null,
  })

  if (params.delivered && params.bookingId) {
    await supabase.from('notification_log').insert({
      booking_id: params.bookingId,
      type: params.type,
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
        View Job
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
  type: NotificationType,
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
      bookingId,
      type,
      channel: 'email',
      recipient: driverId,
      body,
      delivered: false,
      error: 'No email address on driver record',
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
    bookingId,
    type,
    channel: 'email',
    recipient: driver.email,
    body,
    delivered: res.ok,
    error: res.ok ? undefined : `Resend HTTP ${res.status}`,
  })

  return res.ok
}

export interface PushParams {
  driverId: string
  bookingId: string
  type: NotificationType
  title: string
  body: string
  url: string
}

/** Sends a high-priority web push to every subscription registered by the driver.
 *  Falls back to email if no subscription exists or all push deliveries fail. */
export async function pushToDriver(supabase: SupabaseClient, params: PushParams): Promise<boolean> {
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .eq('driver_id', params.driverId)

  if (!subs || subs.length === 0) {
    await recordNotification(supabase, {
      bookingId: params.bookingId,
      type: params.type,
      channel: 'push',
      recipient: params.driverId,
      body: params.body,
      delivered: false,
      error: 'No push subscription registered for driver',
    })
    // Email fallback
    return sendEmailToDriver(supabase, params.driverId, params.bookingId, params.type, params.title, params.body, params.url)
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    await recordNotification(supabase, {
      bookingId: params.bookingId,
      type: params.type,
      channel: 'push',
      recipient: params.driverId,
      body: params.body,
      delivered: false,
      error: 'VAPID keys not configured',
    })
    return sendEmailToDriver(supabase, params.driverId, params.bookingId, params.type, params.title, params.body, params.url)
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
    bookingId: params.bookingId,
    type: params.type,
    channel: 'push',
    recipient: params.driverId,
    body: params.body,
    delivered,
    error: delivered ? undefined : (failureDetail || 'All push subscriptions failed'),
  })

  if (!delivered) {
    // Email fallback
    return sendEmailToDriver(supabase, params.driverId, params.bookingId, params.type, params.title, params.body, params.url)
  }

  return true
}
