// "New job" push to the assigned driver. Called only by the trg_booking_push
// trigger (notify_driver_new_booking) when a booking's driver is set/changed.
//
// Security (audit H-1, 15/10/2026): the function is reachable from the
// internet (verify_jwt off), so it
//   1. refuses any request without the database trigger's shared secret, and
//   2. takes only the booking id from the request and reads the driver,
//      customer and pickup from the database, so a request body can never
//      choose who is notified or what the message says.
// Dependencies are injected so this can be unit-tested with Node.

import { isTrustedTrigger, UUID_RE } from '../_shared/webhookAuth.ts'

export interface PushSub { id: string; endpoint: string; p256dh: string; auth_key: string }
export interface NewJobBooking {
  id: string
  customer_name: string | null
  pickup_location: string | null
  airport: string | null
  assigned_driver_id: string | null
}

export interface SendPushDeps {
  loadWebhookSecret: () => Promise<string | null>
  loadBooking: (id: string) => Promise<NewJobBooking | null>
  loadSubscriptions: (driverId: string) => Promise<PushSub[]>
  sendPush: (sub: PushSub, payload: string) => Promise<unknown>
  deleteSubscriptions: (ids: string[]) => Promise<void>
  recordNotification: (p: {
    bookingId: string; type: 'job_assigned'; channel: 'push'; recipient: string
    body: string; delivered: boolean; error?: string
  }) => Promise<void>
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export async function handleSendPush(req: Request, deps: SendPushDeps): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  if (!(await isTrustedTrigger(req.headers, deps.loadWebhookSecret))) {
    return json({ error: 'Unauthorized' }, 401)
  }

  let bookingId: unknown
  try {
    const body = await req.json()
    bookingId = (body?.record ?? body)?.id
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }
  if (typeof bookingId !== 'string' || !UUID_RE.test(bookingId)) return json({ error: 'Invalid booking id' }, 400)

  const booking = await deps.loadBooking(bookingId)
  const driverId = booking?.assigned_driver_id
  if (!booking || !driverId) return json({ sent: 0 })

  const subs = await deps.loadSubscriptions(driverId)
  const customerName = booking.customer_name ?? 'New booking'
  const pickup = booking.pickup_location ?? booking.airport ?? 'See job details'
  const body = `${customerName} · ${pickup}`

  if (!subs || subs.length === 0) {
    await deps.recordNotification({
      bookingId, type: 'job_assigned', channel: 'push', recipient: driverId, body,
      delivered: false, error: 'No push subscription registered for driver',
    })
    return json({ sent: 0 })
  }

  const payload = JSON.stringify({
    title: `New job — ${customerName}`,
    body: pickup,
    url: `/jobs/${bookingId}`,
    icon: '/logo.png',
    badge: '/logo.png',
  })

  const results = await Promise.allSettled(subs.map((sub) => deps.sendPush(sub, payload)))

  // Remove expired subscriptions
  const expired = subs.filter((_sub, i) => {
    const r = results[i]
    return r.status === 'rejected' && (r as PromiseRejectedResult).reason?.statusCode === 410
  })
  if (expired.length > 0) await deps.deleteSubscriptions(expired.map((s) => s.id))

  const sent = results.filter((r) => r.status === 'fulfilled').length
  const delivered = sent > 0
  await deps.recordNotification({
    bookingId, type: 'job_assigned', channel: 'push', recipient: driverId, body,
    delivered, error: delivered ? undefined : 'All push subscriptions failed',
  })
  return json({ sent, total: subs.length })
}
