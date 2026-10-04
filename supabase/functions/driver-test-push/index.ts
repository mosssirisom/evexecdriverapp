import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
// @ts-ignore - no type declarations published for this package
import webpush from "npm:web-push@3.6.7"

// "Send test notification" on the Driver App's Profile screen. Sends one
// push to the signed-in driver's OWN registered phones only (nobody else's),
// and removes subscriptions Apple/Google report as gone (404/410).

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return json({ error: 'Push not configured' }, 500)

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
  const { data: { user } } = await createClient(SUPABASE_URL, SUPABASE_ANON_KEY).auth.getUser(token)
  if (!user) return json({ error: 'Unauthorised' }, 401)

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .eq('driver_id', user.id)
  if (!subs || subs.length === 0) return json({ sent: 0, total: 0 })

  webpush.setVapidDetails('mailto:driver@evexec.co.uk', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  const payload = JSON.stringify({
    title: 'EV Exec test notification',
    body: 'Notifications are working on this phone.',
    url: '/profile',
    tag: `test-${Date.now()}`,
  })

  const results = await Promise.allSettled(
    subs.map((s: { endpoint: string; p256dh: string; auth_key: string }) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } }, payload, { TTL: 300, urgency: 'high' })
    )
  )

  const gone = subs.filter((_s: unknown, i: number) => {
    const r = results[i]
    const code = r.status === 'rejected' ? (r as PromiseRejectedResult).reason?.statusCode : null
    return code === 404 || code === 410
  })
  if (gone.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', gone.map((s: { id: string }) => s.id))
  }

  return json({
    sent: results.filter((r) => r.status === 'fulfilled').length,
    total: subs.length,
    removed: gone.length,
  })
})
