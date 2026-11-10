import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { recordNotification } from '../_shared/notify.ts'
// @ts-ignore - no type declarations published for this package
import webpush from "npm:web-push@3.6.7"
import { handleSendPush, type PushSub } from './handler.ts'

// Invoked by the `trg_booking_push` trigger (notify_driver_new_booking)
// whenever a booking's assigned_driver_id is set/changed. Sends a web push
// to every subscription the driver has registered. Requests must carry the
// trigger's x-webhook-secret; see handler.ts.

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

Deno.serve((req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  return handleSendPush(req, {
    loadWebhookSecret: async () => {
      const { data, error } = await supabase.rpc('driver_alert_webhook_secrets')
      if (error) throw error
      return (data as string[] | null) ?? null
    },
    loadBooking: async (id) => {
      const { data } = await supabase
        .from('bookings')
        .select('id, customer_name, pickup_location, airport, assigned_driver_id')
        .eq('id', id)
        .maybeSingle()
      return data ?? null
    },
    loadSubscriptions: async (driverId) => {
      const { data } = await supabase
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth_key')
        .eq('driver_id', driverId)
      return (data ?? []) as PushSub[]
    },
    sendPush: (sub, payload) =>
      webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload),
    deleteSubscriptions: async (ids) => {
      await supabase.from('push_subscriptions').delete().in('id', ids)
    },
    recordNotification: (p) => recordNotification(supabase, p),
  })
})
