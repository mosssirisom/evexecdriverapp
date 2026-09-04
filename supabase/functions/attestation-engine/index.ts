// Zero-Failure Driver Attestation Loop
//
// Invoked once per minute by pg_cron + pg_net (see migration
// 20260610090000_driver_attestation_loop.sql for the scheduling setup).
//
// State machine (bookings.attestation_status):
//
//   not_required ──(check_time reached)──> awaiting_first_attestation
//        │  push "confirm your pickup"
//        │  wait attestation_first_gate_minutes (default 10)
//        ▼
//   awaiting_second_attestation ──(driver confirms anytime)──> confirmed (terminal)
//        │  urgent push "confirm NOW"
//        │  wait attestation_second_gate_minutes (default 5)
//        ▼
//   reallocating
//        │  suspend the unresponsive driver (operator must manually reset)
//        │  exclude them from this booking and find the next available driver
//        ├─ found  ──> re-assign, restart loop with COMPRESSED windows (3 min/gate)
//        └─ none   ──> CRITICAL_UNALLOCATED + SYSTEM_PANIC (operator SMS + call)
//
// Edge cases:
//  - Every state transition that depends on `driver_confirmed_at IS NULL` is
//    performed as a guarded UPDATE (`.eq('attestation_status', <expected>)`)
//    that re-checks the condition at write time. If the driver confirms in
//    the same instant the engine is escalating, the UPDATE affects 0 rows
//    and the booking is simply left alone (already `confirmed`).
//  - Re-arming the loop after a manual reassignment/reschedule (i.e. ops
//    changes `pickup_time` or `assigned_driver_id` on a booking that already
//    went through the loop) is intentionally left to the operator app — see
//    the comment on `bookings_set_check_time()` in the migration.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { sendSms, makeVoiceCall } from '../_shared/twilio.ts'
import { pushToDriver, recordNotification, type NotificationType } from '../_shared/notify.ts'
import { findNextAvailableDriver } from '../_shared/dispatch.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const OPERATOR_PHONE = Deno.env.get('OPERATOR_PHONE') ?? ''

/** Gate window used for every attestation cycle that follows a reallocation. */
const COMPRESSED_GATE_MINUTES = 3

/** Safety valve: stop reallocating (and raise the panic gate instead) after this many handoffs. */
const MAX_REALLOCATIONS = 10

const BOOKING_COLUMNS = `
  id, ref, customer_name, pickup_location, airport, travel_time, travel_date,
  pickup_time, pickup_lat, pickup_lng, status, assigned_driver_id,
  attestation_status, check_time, attestation_first_gate_minutes,
  attestation_second_gate_minutes, attestation_first_deadline,
  attestation_second_deadline, driver_confirmed_at, reallocation_count,
  excluded_driver_ids
`

interface AttestationBooking {
  id: string
  ref: string
  customer_name: string
  pickup_location: string | null
  airport: string | null
  travel_time: string | null
  travel_date: string | null
  pickup_time: string | null
  pickup_lat: number | null
  pickup_lng: number | null
  status: string
  assigned_driver_id: string | null
  attestation_status: string
  check_time: string | null
  attestation_first_gate_minutes: number
  attestation_second_gate_minutes: number
  attestation_first_deadline: string | null
  attestation_second_deadline: string | null
  driver_confirmed_at: string | null
  reallocation_count: number
  excluded_driver_ids: string[] | null
}

interface RunSummary {
  first_gate: number
  second_gate: number
  reallocated: number
  panics: number
  confirmed_in_time: number
  errors: string[]
}

function pickupSummary(booking: AttestationBooking): string {
  const place = booking.pickup_location ?? booking.airport ?? 'pickup'
  const time = booking.travel_time
    ?? (booking.pickup_time ? new Date(booking.pickup_time).toISOString().slice(11, 16) : 'the scheduled time')
  const date = booking.travel_date
    ? new Date(booking.travel_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/London' })
    : ''
  return `${booking.customer_name} at ${time}${date ? ` on ${date}` : ''} (${place})`
}

/** Sends a push notification for a given gate to the currently assigned driver. */
async function sendGateNotification(
  supabase: SupabaseClient,
  booking: AttestationBooking,
  opts: { type: NotificationType; title: string; pushBody: string }
): Promise<void> {
  if (!booking.assigned_driver_id) return

  await pushToDriver(supabase, {
    driverId: booking.assigned_driver_id,
    bookingId: booking.id,
    type: opts.type,
    title: opts.title,
    body: opts.pushBody,
    url: `/jobs/${booking.id}`,
  })
}

async function triggerOperatorPanic(supabase: SupabaseClient, booking: AttestationBooking): Promise<void> {
  const message = `EV Exec SYSTEM PANIC: No driver confirmed booking ${booking.ref} - ${pickupSummary(booking)}. Manual dispatch required NOW.`

  if (!OPERATOR_PHONE) {
    await recordNotification(supabase, {
      bookingId: booking.id,
      type: 'operator_panic',
      channel: 'sms',
      recipient: 'operator',
      body: message,
      delivered: false,
      error: 'OPERATOR_PHONE is not configured',
    })
    return
  }

  const sms = await sendSms(OPERATOR_PHONE, message)
  await recordNotification(supabase, {
    bookingId: booking.id,
    type: 'operator_panic',
    channel: 'sms',
    recipient: OPERATOR_PHONE,
    body: message,
    delivered: sms.ok,
    providerMessageId: sms.sid,
    error: sms.error,
  })

  const call = await makeVoiceCall(OPERATOR_PHONE, message)
  await recordNotification(supabase, {
    bookingId: booking.id,
    type: 'operator_panic',
    channel: 'voice',
    recipient: OPERATOR_PHONE,
    body: message,
    delivered: call.ok,
    providerMessageId: call.sid,
    error: call.error,
  })
}

/** GATE 1: check_time reached -> awaiting_first_attestation. */
async function runFirstGate(supabase: SupabaseClient, now: Date, summary: RunSummary): Promise<void> {
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .eq('attestation_status', 'not_required')
    .not('assigned_driver_id', 'is', null)
    .not('check_time', 'is', null)
    .lte('check_time', now.toISOString())
    .not('status', 'in', '(Completed,Cancelled,CRITICAL_UNALLOCATED)')

  if (error) throw new Error(`first_gate select: ${error.message}`)

  for (const booking of (bookings ?? []) as AttestationBooking[]) {
    const deadline = new Date(now.getTime() + booking.attestation_first_gate_minutes * 60_000)

    const { data: claimed, error: updateError } = await supabase
      .from('bookings')
      .update({
        attestation_status: 'awaiting_first_attestation',
        first_attestation_sent_at: now.toISOString(),
        attestation_first_deadline: deadline.toISOString(),
      })
      .eq('id', booking.id)
      .eq('attestation_status', 'not_required')
      .select('id')

    if (updateError) {
      summary.errors.push(`first_gate update ${booking.id}: ${updateError.message}`)
      continue
    }
    if (!claimed || claimed.length === 0) continue // already claimed by a previous run

    await sendGateNotification(supabase, booking, {
      type: 'attestation_first',
      title: 'Confirm your pickup',
      pushBody: `Tap to confirm you're on track for ${pickupSummary(booking)}`,
    })

    summary.first_gate += 1
  }
}

/** GATE 2: gate-1 deadline passed without confirmation -> awaiting_second_attestation (urgent). */
async function runSecondGate(supabase: SupabaseClient, now: Date, summary: RunSummary): Promise<void> {
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .eq('attestation_status', 'awaiting_first_attestation')
    .not('attestation_first_deadline', 'is', null)
    .lte('attestation_first_deadline', now.toISOString())
    .is('driver_confirmed_at', null)

  if (error) throw new Error(`second_gate select: ${error.message}`)

  for (const booking of (bookings ?? []) as AttestationBooking[]) {
    const deadline = new Date(now.getTime() + booking.attestation_second_gate_minutes * 60_000)

    // Guarded transition: if the driver confirmed between the SELECT above
    // and this UPDATE, `driver_confirmed_at` is no longer null and 0 rows
    // are affected — the booking stays `confirmed` and is left alone.
    const { data: claimed, error: updateError } = await supabase
      .from('bookings')
      .update({
        attestation_status: 'awaiting_second_attestation',
        second_attestation_sent_at: now.toISOString(),
        attestation_second_deadline: deadline.toISOString(),
      })
      .eq('id', booking.id)
      .eq('attestation_status', 'awaiting_first_attestation')
      .is('driver_confirmed_at', null)
      .select('id')

    if (updateError) {
      summary.errors.push(`second_gate update ${booking.id}: ${updateError.message}`)
      continue
    }
    if (!claimed || claimed.length === 0) {
      summary.confirmed_in_time += 1
      continue
    }

    await sendGateNotification(supabase, booking, {
      type: 'attestation_second_urgent',
      title: 'URGENT: Confirm your pickup now',
      pushBody: `FINAL WARNING — confirm now or this job will be reassigned: ${pickupSummary(booking)}`,
    })

    summary.second_gate += 1
  }
}

/** GATE 3/4: gate-2 deadline passed without confirmation -> reallocate or panic. */
async function runReallocation(supabase: SupabaseClient, now: Date, summary: RunSummary): Promise<void> {
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .eq('attestation_status', 'awaiting_second_attestation')
    .not('attestation_second_deadline', 'is', null)
    .lte('attestation_second_deadline', now.toISOString())
    .is('driver_confirmed_at', null)

  if (error) throw new Error(`reallocation select: ${error.message}`)

  for (const booking of (bookings ?? []) as AttestationBooking[]) {
    // Guarded claim: same last-second-confirmation protection as gate 2.
    const { data: claimed, error: claimError } = await supabase
      .from('bookings')
      .update({ attestation_status: 'reallocating' })
      .eq('id', booking.id)
      .eq('attestation_status', 'awaiting_second_attestation')
      .is('driver_confirmed_at', null)
      .select('id')

    if (claimError) {
      summary.errors.push(`reallocation claim ${booking.id}: ${claimError.message}`)
      continue
    }
    if (!claimed || claimed.length === 0) {
      summary.confirmed_in_time += 1
      continue
    }

    const failedDriverId = booking.assigned_driver_id
    const excludedIds = [...(booking.excluded_driver_ids ?? [])]
    if (failedDriverId && !excludedIds.includes(failedDriverId)) excludedIds.push(failedDriverId)

    // Suspend the unresponsive driver. Requires operator manual reset
    // (clear suspended_at/suspended_reason and set status back to Available).
    if (failedDriverId) {
      await supabase
        .from('drivers')
        .update({
          status: 'Suspended',
          is_online: false,
          suspended_at: now.toISOString(),
          suspended_reason: `Missed both attestation gates for booking ${booking.ref}`,
        })
        .eq('id', failedDriverId)
    }

    const reallocationCount = booking.reallocation_count + 1
    const exhausted = reallocationCount > MAX_REALLOCATIONS

    const nextDriver = exhausted
      ? null
      : await findNextAvailableDriver(supabase, {
          assigned_driver_id: failedDriverId,
          excluded_driver_ids: excludedIds,
          travel_date: booking.travel_date,
          pickup_lat: booking.pickup_lat,
          pickup_lng: booking.pickup_lng,
        })

    if (nextDriver) {
      const newDeadline = new Date(now.getTime() + COMPRESSED_GATE_MINUTES * 60_000)

      const { error: reassignError } = await supabase
        .from('bookings')
        .update({
          assigned_driver_id: nextDriver.id,
          status: 'Dispatched',
          attestation_status: 'awaiting_first_attestation',
          attestation_first_gate_minutes: COMPRESSED_GATE_MINUTES,
          attestation_second_gate_minutes: COMPRESSED_GATE_MINUTES,
          attestation_first_deadline: newDeadline.toISOString(),
          attestation_second_deadline: null,
          first_attestation_sent_at: now.toISOString(),
          second_attestation_sent_at: null,
          driver_confirmed_at: null,
          reallocation_count: reallocationCount,
          excluded_driver_ids: excludedIds,
        })
        .eq('id', booking.id)

      if (reassignError) {
        summary.errors.push(`reallocation reassign ${booking.id}: ${reassignError.message}`)
        continue
      }

      await sendGateNotification(
        supabase,
        { ...booking, assigned_driver_id: nextDriver.id },
        {
          type: 'attestation_reallocated',
          title: 'New job — confirm immediately',
          pushBody: `You've been assigned a pickup that needs confirming now: ${pickupSummary(booking)}`,
        }
      )

      summary.reallocated += 1
    } else {
      // Final gate: SYSTEM_PANIC — no driver available to reassign to.
      const { error: panicError } = await supabase
        .from('bookings')
        .update({
          status: 'CRITICAL_UNALLOCATED',
          attestation_status: 'critical_unallocated',
          assigned_driver_id: null,
          reallocation_count: reallocationCount,
          excluded_driver_ids: excludedIds,
        })
        .eq('id', booking.id)

      if (panicError) {
        summary.errors.push(`reallocation panic ${booking.id}: ${panicError.message}`)
        continue
      }

      await triggerOperatorPanic(supabase, booking)
      summary.panics += 1
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const now = new Date()

  const summary: RunSummary = {
    first_gate: 0,
    second_gate: 0,
    reallocated: 0,
    panics: 0,
    confirmed_in_time: 0,
    errors: [],
  }

  // Each gate runs independently and catches its own errors so that one
  // failing booking (or a transient DB error) can't block the others.
  for (const gate of [runFirstGate, runSecondGate, runReallocation]) {
    try {
      await gate(supabase, now, summary)
    } catch (err) {
      summary.errors.push(err instanceof Error ? err.message : String(err))
    }
  }

  return new Response(JSON.stringify(summary), {
    headers: { 'Content-Type': 'application/json' },
  })
})
