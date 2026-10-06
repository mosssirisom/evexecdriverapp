// Notification helpers shared by the attestation engine.
//
// Push delivery uses VAPID web-push. Email is the fallback when the driver has
// no push subscription or all push deliveries fail; it is queued for the
// website to send (queueEmail). Every attempt is recorded in
// `notification_queue` for audit/retry visibility.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
// @ts-ignore - no type declarations published for this package
import webpush from 'npm:web-push@3.6.7'
import { emailShell, pillHtml, PILL } from './emailLayout.ts'

const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const APP_URL           = Deno.env.get('APP_URL') ?? 'https://evexec.co.uk'

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

/** Queues an email for the website to send (it holds the Resend key; the
 *  every-minute notification-queue-sweep sends it). Edge functions have no
 *  email key of their own, so every email from them goes through here. */
export async function queueEmail(
  supabase: SupabaseClient,
  r: { bookingId: string | null; type: string; to: string; subject: string; html: string; body?: string },
): Promise<boolean> {
  const { error } = await supabase.from('notification_queue').insert({
    booking_id: r.bookingId, type: r.type, channel: 'email', recipient: r.to,
    subject: r.subject, html: r.html, body: r.body ?? null,
    status: 'pending', attempts: 0, next_attempt_at: new Date().toISOString(),
  })
  if (error) console.error(`[queueEmail] ${r.type} for ${r.bookingId}:`, error.message)
  return !error
}

function driverEmailHtml(title: string, body: string, jobUrl: string): string {
  return emailShell(title, `
    ${pillHtml('Driver notification', PILL.blue)}
    <h2 style="color:#0f1b33;font-size:17px;font-weight:700;margin:18px 0 10px">${escapeHtml(title)}</h2>
    <p style="color:#0f1b33;font-size:15px;margin:0 0 24px;line-height:1.6">${escapeHtml(body)}</p>
    <a href="${APP_URL}${jobUrl}"
       style="display:inline-block;background:#C9A550;color:#0B132B;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none">
      View Job
    </a>`)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
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

  return queueEmail(supabase, { bookingId, type, to: driver.email, subject: title, html: driverEmailHtml(title, body, url), body })
}

export interface PushParams {
  driverId: string
  bookingId: string
  type: NotificationType
  title: string
  body: string
  url: string
  /** Set when the caller sends its own, more detailed email if push fails. */
  noEmailFallback?: boolean
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
    return params.noEmailFallback ? false : sendEmailToDriver(supabase, params.driverId, params.bookingId, params.type, params.title, params.body, params.url)
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
    return params.noEmailFallback ? false : sendEmailToDriver(supabase, params.driverId, params.bookingId, params.type, params.title, params.body, params.url)
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
    return params.noEmailFallback ? false : sendEmailToDriver(supabase, params.driverId, params.bookingId, params.type, params.title, params.body, params.url)
  }

  return true
}
