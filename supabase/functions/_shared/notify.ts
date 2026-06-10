// Notification helpers shared by the attestation engine.
//
// Push delivery uses the same VAPID web-push setup as the `send-push`
// function. Every attempt (push/sms/whatsapp/voice) is recorded into
// `notification_queue` for audit/retry visibility, and successful sends are
// additionally mirrored into `notification_log` to match the existing
// reporting convention.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
// @ts-ignore - no type declarations published for this package
import webpush from 'npm:web-push@3.6.7'

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:driver@evexec.co.uk', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

export type NotificationType =
  | 'attestation_first'
  | 'attestation_second_urgent'
  | 'attestation_reallocated'
  | 'operator_panic'

export type NotificationChannel = 'push' | 'sms' | 'whatsapp' | 'voice'

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

export interface PushParams {
  driverId: string
  bookingId: string
  type: NotificationType
  title: string
  body: string
  url: string
}

/** Sends a high-priority web push to every subscription registered by the driver. */
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
    return false
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
    return false
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

  await recordNotification(supabase, {
    bookingId: params.bookingId,
    type: params.type,
    channel: 'push',
    recipient: params.driverId,
    body: params.body,
    delivered,
    error: delivered ? undefined : 'All push subscriptions failed',
  })

  return delivered
}
