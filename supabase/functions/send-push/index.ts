import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
// @ts-ignore - no type declarations published for this package
import webpush from "npm:web-push@3.6.7"

// Invoked by the `trg_booking_push` trigger (notify_driver_new_booking)
// whenever a booking's assigned_driver_id is set/changed. Sends a web push
// to every subscription the driver has registered.

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:driver@evexec.co.uk',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  )
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let booking: Record<string, unknown>
  try {
    const body = await req.json()
    booking = (body.record ?? body) as Record<string, unknown>
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const driverId = booking.assigned_driver_id as string | undefined
  if (!driverId) {
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .eq('driver_id', driverId)

  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const customerName = (booking.customer_name as string) ?? 'New booking'
  const pickup = (booking.pickup_location as string) ??
    (booking.airport as string) ??
    'See job details'
  const bookingId = booking.id as string

  const payload = JSON.stringify({
    title: `New job — ${customerName}`,
    body: pickup,
    url: `/jobs/${bookingId}`,
    icon: '/logo.png',
    badge: '/logo.png',
  })

  const results = await Promise.allSettled(
    subs.map((sub: { endpoint: string; p256dh: string; auth_key: string }) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        payload
      )
    )
  )

  // Remove expired subscriptions
  const expired = subs.filter((_sub: unknown, i: number) => {
    const r = results[i]
    return r.status === 'rejected' &&
      (r as PromiseRejectedResult).reason?.statusCode === 410
  })
  if (expired.length > 0) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .in('id', expired.map((s: { id: string }) => s.id))
  }

  const sent = results.filter((r) => r.status === 'fulfilled').length
  return new Response(JSON.stringify({ sent, total: subs.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
