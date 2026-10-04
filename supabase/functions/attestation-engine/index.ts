// Driver Attestation — reminder-only (user decision, 2026-10-03)
//
// Invoked once per minute by pg_cron + pg_net (cron job
// 'attestation-engine-sweep').
//
// State machine (bookings.attestation_status, plain text; null = not started):
//
//   null / not_required ──(60 min before pickup)──> awaiting_first_attestation
//        │  push "Confirm your pickup"
//        │  wait FIRST_GATE_MINUTES (10)
//        ▼
//   awaiting_second_attestation  ──(driver confirms anytime)──> confirmed
//        │  urgent push "Confirm now"
//        │  wait SECOND_GATE_MINUTES (5)
//        ▼
//   operator_alerted
//        push to every operator device + email to the business contact
//        address; the dispatch board flags the job. Nothing else happens
//        automatically: no driver is suspended and no job is reassigned.
//
// A driver "confirms" by tapping Confirm on the dashboard (sets
// driver_confirmed_at) or simply by swiping the job to En Route or beyond.
//
// The original design (auto-suspend + auto-reassign + Twilio SMS/voice panic
// to the operator) was never live: its schema migration was never applied.
// The user chose this reminder-only version instead.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
// @ts-ignore - no type declarations published for this package
import webpush from 'npm:web-push@3.6.7'
import { pushToDriver, recordNotification } from '../_shared/notify.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const FIRST_LEAD_MINUTES = 60
const FIRST_GATE_MINUTES = 10
const SECOND_GATE_MINUTES = 5

const PRE_PICKUP = ['accepted', 'confirmed', 'Dispatched']
const STARTED = ['En Route', 'en_route', 'Arrived', 'arrived', 'Passenger On Board', 'Active', 'active', 'Completed', 'completed']

const COLUMNS = `
  id, ref, tenant_id, customer_name, pickup_location, airport, travel_date, travel_time,
  pickup_time, status, assigned_driver_id, attestation_status, driver_confirmed_at,
  attestation_first_deadline, attestation_second_deadline
`

interface Booking {
  id: string
  ref: string | null
  tenant_id: string | null
  customer_name: string | null
  pickup_location: string | null
  airport: string | null
  travel_date: string | null
  travel_time: string | null
  pickup_time: string | null
  status: string
  assigned_driver_id: string | null
  attestation_status: string | null
  driver_confirmed_at: string | null
  attestation_first_deadline: string | null
  attestation_second_deadline: string | null
}

interface RunSummary {
  first_gate: number
  second_gate: number
  operator_alerts: number
  confirmed: number
  errors: string[]
}

/** Converts a UK wall-clock date + time to a UTC Date (handles BST/GMT). */
function londonToUtc(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(guess)).map((p) => [p.type, p.value])
  )
  const asLondon = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute)
  return new Date(guess - (asLondon - guess))
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function pickupAt(b: Booking): Date | null {
  if (b.pickup_time) return new Date(b.pickup_time)
  if (b.travel_date && b.travel_time) return londonToUtc(b.travel_date, b.travel_time)
  return null
}

function pickupSummary(b: Booking): string {
  const place = b.pickup_location ?? b.airport ?? 'pickup'
  const at = pickupAt(b)
  const time = at
    ? `${at.toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: '2-digit', year: 'numeric' })} ${at.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`
    : 'the scheduled time'
  return `${b.customer_name ?? 'Customer'} at ${time} (${place})`
}

/** Marks a booking confirmed when the driver has already started the job. */
async function markStarted(supabase: SupabaseClient, b: Booking, summary: RunSummary): Promise<boolean> {
  if (!STARTED.includes(b.status) && !b.driver_confirmed_at) return false
  await supabase.from('bookings').update({ attestation_status: 'confirmed' })
    .eq('id', b.id).eq('attestation_status', b.attestation_status ?? '')
  summary.confirmed += 1
  return true
}

/** Stop chasing jobs that were cancelled or unassigned mid-loop. */
async function markNotRequired(supabase: SupabaseClient, b: Booking): Promise<boolean> {
  if (b.assigned_driver_id && PRE_PICKUP.includes(b.status)) return false
  await supabase.from('bookings').update({ attestation_status: 'not_required' })
    .eq('id', b.id).eq('attestation_status', b.attestation_status ?? '')
  return true
}

/** GATE 1: 60 min before pickup -> awaiting_first_attestation + push. */
async function runFirstGate(supabase: SupabaseClient, now: Date, summary: RunSummary): Promise<void> {
  const from = new Date(now.getTime() - 2 * 86_400_000).toISOString().slice(0, 10)
  const to = new Date(now.getTime() + 2 * 86_400_000).toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('bookings')
    .select(COLUMNS)
    .in('status', PRE_PICKUP)
    .not('assigned_driver_id', 'is', null)
    .is('driver_confirmed_at', null)
    .or('attestation_status.is.null,attestation_status.eq.not_required')
    .gte('travel_date', from)
    .lte('travel_date', to)

  if (error) throw new Error(`first_gate select: ${error.message}`)

  for (const b of (data ?? []) as Booking[]) {
    const at = pickupAt(b)
    if (!at) continue
    const opensAt = at.getTime() - FIRST_LEAD_MINUTES * 60_000
    if (now.getTime() < opensAt || now.getTime() >= at.getTime()) continue

    const { data: claimed, error: updateError } = await supabase
      .from('bookings')
      .update({
        attestation_status: 'awaiting_first_attestation',
        first_attestation_sent_at: now.toISOString(),
        attestation_first_deadline: new Date(now.getTime() + FIRST_GATE_MINUTES * 60_000).toISOString(),
      })
      .eq('id', b.id)
      .or('attestation_status.is.null,attestation_status.eq.not_required')
      .select('id')

    if (updateError) { summary.errors.push(`first_gate update ${b.id}: ${updateError.message}`); continue }
    if (!claimed || claimed.length === 0) continue

    await pushToDriver(supabase, {
      driverId: b.assigned_driver_id!,
      bookingId: b.id,
      type: 'attestation_first',
      title: 'Confirm your pickup',
      body: `Tap to confirm you're on track for ${pickupSummary(b)}`,
      url: '/dashboard',
    })
    summary.first_gate += 1
  }
}

/** GATE 2: first deadline passed, not confirmed -> urgent push. */
async function runSecondGate(supabase: SupabaseClient, now: Date, summary: RunSummary): Promise<void> {
  const { data, error } = await supabase
    .from('bookings')
    .select(COLUMNS)
    .eq('attestation_status', 'awaiting_first_attestation')
    .lte('attestation_first_deadline', now.toISOString())

  if (error) throw new Error(`second_gate select: ${error.message}`)

  for (const b of (data ?? []) as Booking[]) {
    if (await markStarted(supabase, b, summary)) continue
    if (await markNotRequired(supabase, b)) continue

    const { data: claimed, error: updateError } = await supabase
      .from('bookings')
      .update({
        attestation_status: 'awaiting_second_attestation',
        second_attestation_sent_at: now.toISOString(),
        attestation_second_deadline: new Date(now.getTime() + SECOND_GATE_MINUTES * 60_000).toISOString(),
      })
      .eq('id', b.id)
      .eq('attestation_status', 'awaiting_first_attestation')
      .is('driver_confirmed_at', null)
      .select('id')

    if (updateError) { summary.errors.push(`second_gate update ${b.id}: ${updateError.message}`); continue }
    if (!claimed || claimed.length === 0) continue

    await pushToDriver(supabase, {
      driverId: b.assigned_driver_id!,
      bookingId: b.id,
      type: 'attestation_second_urgent',
      title: 'URGENT: Confirm your pickup now',
      body: `Please confirm now so the office knows you're covering ${pickupSummary(b)}`,
      url: '/dashboard',
    })
    summary.second_gate += 1
  }
}

/** Pushes to every operator device registered in the operator dashboard. */
async function pushOperators(supabase: SupabaseClient, title: string, body: string, url: string): Promise<number> {
  const { data: config } = await supabase
    .from('push_config')
    .select('vapid_public, vapid_private, vapid_subject')
    .eq('id', true)
    .maybeSingle()
  if (!config?.vapid_public || !config?.vapid_private) return 0

  const { data: subs } = await supabase.from('operator_push_subscriptions').select('id, endpoint, p256dh, auth')
  if (!subs || subs.length === 0) return 0

  const payload = JSON.stringify({ title, body, url, tag: `attestation-${url}` })
  const vapidDetails = {
    subject: config.vapid_subject || 'mailto:book@evexec.co.uk',
    publicKey: config.vapid_public,
    privateKey: config.vapid_private,
  }
  const results = await Promise.allSettled(
    subs.map((s: { endpoint: string; p256dh: string; auth: string }) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { vapidDetails })
    )
  )
  const expired = subs.filter((_s: unknown, i: number) => {
    const r = results[i]
    return r.status === 'rejected' && (r as PromiseRejectedResult).reason?.statusCode === 410
  })
  if (expired.length > 0) {
    await supabase.from('operator_push_subscriptions').delete().in('id', expired.map((s: { id: string }) => s.id))
  }
  return results.filter((r) => r.status === 'fulfilled').length
}

/** GATE 3: second deadline passed, not confirmed -> alert the operator. */
async function runOperatorAlert(supabase: SupabaseClient, now: Date, summary: RunSummary): Promise<void> {
  const { data, error } = await supabase
    .from('bookings')
    .select(COLUMNS)
    .eq('attestation_status', 'awaiting_second_attestation')
    .lte('attestation_second_deadline', now.toISOString())

  if (error) throw new Error(`operator_alert select: ${error.message}`)

  for (const b of (data ?? []) as Booking[]) {
    if (await markStarted(supabase, b, summary)) continue
    if (await markNotRequired(supabase, b)) continue

    const { data: claimed, error: updateError } = await supabase
      .from('bookings')
      .update({ attestation_status: 'operator_alerted', operator_alerted_at: now.toISOString() })
      .eq('id', b.id)
      .eq('attestation_status', 'awaiting_second_attestation')
      .is('driver_confirmed_at', null)
      .select('id')

    if (updateError) { summary.errors.push(`operator_alert update ${b.id}: ${updateError.message}`); continue }
    if (!claimed || claimed.length === 0) continue

    const { data: driver } = await supabase.from('drivers').select('full_name, phone').eq('id', b.assigned_driver_id!).maybeSingle()
    const driverName = driver?.full_name ?? 'The assigned driver'
    const ref = b.ref ?? b.id.slice(0, 8).toUpperCase()
    const title = `Driver hasn't confirmed: ${ref}`
    const message = `${driverName} hasn't confirmed ${pickupSummary(b)} after two reminders. Please check in with them${driver?.phone ? ` on ${driver.phone}` : ''} or reassign the job.`

    const pushed = await pushOperators(supabase, title, message, '/operator/dispatch')
    await recordNotification(supabase, {
      bookingId: b.id, type: 'operator_panic', channel: 'push', recipient: 'operators',
      body: message, delivered: pushed > 0, error: pushed > 0 ? undefined : 'No operator push delivered',
    })

    // Email goes through notification_queue so the website (which holds the
    // Resend key) sends it via the every-minute notification-queue-sweep.
    const { data: tenant } = b.tenant_id
      ? await supabase.from('tenants').select('contact_email').eq('id', b.tenant_id).maybeSingle()
      : { data: null }
    if (tenant?.contact_email) {
      // Same branded shell as every other EV Exec notification email.
      const { data: branded } = await supabase.rpc('evexec_notification_email', {
        p_pill: 'Pickup not confirmed', p_pill_bg: '#fde8e8', p_pill_fg: '#9b1c1c',
        p_lead: `${driverName} hasn't confirmed this pickup after two reminders. Please check in with them or reassign the job.`,
        p_rows: [
          { label: 'Reference', value: ref },
          { label: 'When', value: pickupSummary(b) },
          { label: 'Driver', value: driverName + (driver?.phone ? ` · ${driver.phone}` : '') },
        ],
        p_footnote: 'Open the dispatch board to reassign or update the job.',
      })
      await supabase.from('notification_queue').insert({
        booking_id: b.id,
        type: 'attestation_alert',
        channel: 'email',
        recipient: tenant.contact_email,
        subject: title,
        body: message,
        html: typeof branded === 'string' && branded
          ? branded
          : `<p style="font-family:Inter,Arial,sans-serif;font-size:15px">${escapeHtml(message)}</p>`,
        status: 'pending',
        attempts: 0,
        next_attempt_at: now.toISOString(),
      })
    }

    summary.operator_alerts += 1
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const now = new Date()
  const summary: RunSummary = { first_gate: 0, second_gate: 0, operator_alerts: 0, confirmed: 0, errors: [] }

  for (const gate of [runFirstGate, runSecondGate, runOperatorAlert]) {
    try {
      await gate(supabase, now, summary)
    } catch (err) {
      summary.errors.push(err instanceof Error ? err.message : String(err))
    }
  }

  return new Response(JSON.stringify(summary), { headers: { 'Content-Type': 'application/json' } })
})
