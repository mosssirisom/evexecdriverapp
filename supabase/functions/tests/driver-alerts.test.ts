// Fix 2 (audit H-1): driver-alert functions accept only the database
// trigger's secret and never take the driver or message from the request.
// Run: npm run test:functions   (node --test --experimental-strip-types)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeEqual, isTrustedTrigger } from '../_shared/webhookAuth.ts'
import { handleSendPush, type SendPushDeps, type NewJobBooking } from '../send-push/handler.ts'
import { handleJobUpdate, type JobUpdateDeps, type JobBooking } from '../notify-job-update/handler.ts'

const SECRET = 'test-webhook-secret'
const BOOKING_ID = 'cccccccc-0000-0000-0000-0000000000b1'
const REAL_DRIVER = 'bbbbbbbb-0000-0000-0000-000000000d01'
const VICTIM_DRIVER = 'bbbbbbbb-0000-0000-0000-000000000d02'

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://localhost/fn', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })

// ── safeEqual / isTrustedTrigger ────────────────────────────────────────────
test('safeEqual compares exactly', () => {
  assert.equal(safeEqual('abc', 'abc'), true)
  assert.equal(safeEqual('abc', 'abd'), false)
  assert.equal(safeEqual('abc', 'abcd'), false)
  assert.equal(safeEqual('', ''), true)
})

test('isTrustedTrigger refuses missing, wrong, unconfigured or failing secrets', async () => {
  const h = (v?: string) => new Headers(v === undefined ? {} : { 'x-webhook-secret': v })
  assert.equal(await isTrustedTrigger(h(), async () => SECRET), false)
  assert.equal(await isTrustedTrigger(h('nope'), async () => SECRET), false)
  assert.equal(await isTrustedTrigger(h(''), async () => ''), false)
  assert.equal(await isTrustedTrigger(h(SECRET), async () => null), false)
  assert.equal(await isTrustedTrigger(h(SECRET), async () => { throw new Error('db down') }), false)
  assert.equal(await isTrustedTrigger(h(SECRET), async () => SECRET), true)
})

// ── send-push ───────────────────────────────────────────────────────────────
function sendPushDeps(booking: NewJobBooking | null) {
  const calls = { pushedTo: [] as string[], payloads: [] as string[], loadedSubsFor: [] as string[] }
  const deps: SendPushDeps = {
    loadWebhookSecret: async () => SECRET,
    loadBooking: async (id) => (booking && booking.id === id ? booking : null),
    loadSubscriptions: async (driverId) => {
      calls.loadedSubsFor.push(driverId)
      return [{ id: 's1', endpoint: `https://push.example/${driverId}`, p256dh: 'k', auth_key: 'a' }]
    },
    sendPush: async (sub, payload) => { calls.pushedTo.push(sub.endpoint); calls.payloads.push(payload) },
    deleteSubscriptions: async () => {},
    recordNotification: async () => {},
  }
  return { deps, calls }
}
const realBooking: NewJobBooking = { id: BOOKING_ID, customer_name: 'Real Customer', pickup_location: 'Lytham', airport: null, assigned_driver_id: REAL_DRIVER }

test('send-push: request without the secret is refused and nothing is sent', async () => {
  const { deps, calls } = sendPushDeps(realBooking)
  const res = await handleSendPush(post({ record: { id: BOOKING_ID, assigned_driver_id: VICTIM_DRIVER } }), deps)
  assert.equal(res.status, 401)
  assert.deepEqual(calls.pushedTo, [])
})

test('send-push: wrong secret is refused', async () => {
  const { deps, calls } = sendPushDeps(realBooking)
  const res = await handleSendPush(post({ record: { id: BOOKING_ID } }, { 'x-webhook-secret': 'guess' }), deps)
  assert.equal(res.status, 401)
  assert.deepEqual(calls.pushedTo, [])
})

test('send-push: forged driver and text in the body are ignored; database values are used', async () => {
  const { deps, calls } = sendPushDeps(realBooking)
  const forged = { record: { id: BOOKING_ID, assigned_driver_id: VICTIM_DRIVER, customer_name: 'FAKE', pickup_location: 'Nowhere' } }
  const res = await handleSendPush(post(forged, { 'x-webhook-secret': SECRET }), deps)
  assert.equal(res.status, 200)
  assert.deepEqual(calls.loadedSubsFor, [REAL_DRIVER])
  assert.match(calls.payloads[0], /Real Customer/)
  assert.doesNotMatch(calls.payloads[0], /FAKE|Nowhere/)
})

test('send-push: unknown booking or invalid id sends nothing', async () => {
  const { deps, calls } = sendPushDeps(null)
  assert.equal((await handleSendPush(post({ record: { id: BOOKING_ID } }, { 'x-webhook-secret': SECRET }), deps)).status, 200)
  assert.equal((await handleSendPush(post({ record: { id: 'not-a-uuid' } }, { 'x-webhook-secret': SECRET }), deps)).status, 400)
  assert.deepEqual(calls.pushedTo, [])
})

test('send-push: legitimate trigger call notifies the assigned driver', async () => {
  const { deps, calls } = sendPushDeps(realBooking)
  const res = await handleSendPush(post({ record: { id: BOOKING_ID } }, { 'x-webhook-secret': SECRET }), deps)
  assert.equal(res.status, 200)
  assert.deepEqual(calls.pushedTo, [`https://push.example/${REAL_DRIVER}`])
  assert.deepEqual(JSON.parse(calls.payloads[0]).url, `/jobs/${BOOKING_ID}`)
})

// ── notify-job-update ───────────────────────────────────────────────────────
function jobDeps(booking: JobBooking | null) {
  const calls = { pushes: [] as Array<{ driverId: string; title: string; body: string }>, emails: [] as string[] }
  const deps: JobUpdateDeps = {
    appUrl: 'https://drivers.example',
    loadWebhookSecret: async () => SECRET,
    loadBooking: async (id) => (booking && booking.id === id ? booking : null),
    pushToDriver: async (p) => { calls.pushes.push({ driverId: p.driverId, title: p.title, body: p.body }); return true },
    loadDriver: async () => ({ email: 'driver@example.com', full_name: 'Driver One' }),
    queueEmail: async (r) => { calls.emails.push(r.to); return true },
  }
  return { deps, calls }
}
const activeJob: JobBooking = {
  id: BOOKING_ID, ref: 'EVX-B1', status: 'Dispatched', assigned_driver_id: REAL_DRIVER, customer_name: 'Real Customer',
  travel_date: '2026-11-01', travel_time: '10:00', pickup_location: 'Lytham', airport: 'Manchester Airport', dropoff_address: null, notes: null,
}

test('notify-job-update: forged "job cancelled" without the secret is refused', async () => {
  const { deps, calls } = jobDeps(activeJob)
  const forged = { record: { id: BOOKING_ID, status: 'Cancelled', assigned_driver_id: VICTIM_DRIVER }, old_record: { status: 'Dispatched' } }
  const res = await handleJobUpdate(post(forged), deps)
  assert.equal(res.status, 401)
  assert.deepEqual(calls.pushes, [])
})

test('notify-job-update: even with the secret, a body claiming "Cancelled" does not cancel an active job', async () => {
  const { deps, calls } = jobDeps(activeJob)
  const forged = { record: { id: BOOKING_ID, status: 'Cancelled', assigned_driver_id: VICTIM_DRIVER }, old_record: { ...activeJob } }
  const res = await handleJobUpdate(post(forged, { 'x-webhook-secret': SECRET }), deps)
  assert.equal(res.status, 200)
  assert.deepEqual(calls.pushes, []) // database says Dispatched and nothing changed
})

test('notify-job-update: real cancellation notifies the driver on the booking', async () => {
  const { deps, calls } = jobDeps({ ...activeJob, status: 'Cancelled' })
  const res = await handleJobUpdate(post({ record: { id: BOOKING_ID }, old_record: { status: 'Dispatched' } }, { 'x-webhook-secret': SECRET }), deps)
  assert.equal(res.status, 200)
  assert.equal(calls.pushes.length, 1)
  assert.equal(calls.pushes[0].driverId, REAL_DRIVER)
  assert.match(calls.pushes[0].title, /Job cancelled, EVX-B1/)
})

test('notify-job-update: real time change notifies with the new time', async () => {
  const { deps, calls } = jobDeps({ ...activeJob, travel_time: '11:30' })
  const res = await handleJobUpdate(post({ record: { id: BOOKING_ID }, old_record: { ...activeJob } }, { 'x-webhook-secret': SECRET }), deps)
  assert.equal(res.status, 200)
  assert.equal(calls.pushes.length, 1)
  assert.match(calls.pushes[0].body, /pickup at 11:30 on 01\/11\/2026/)
})

test('notify-job-update: falls back to email when push fails', async () => {
  const { deps, calls } = jobDeps({ ...activeJob, status: 'Cancelled' })
  deps.pushToDriver = async () => false
  await handleJobUpdate(post({ record: { id: BOOKING_ID }, old_record: { status: 'Dispatched' } }, { 'x-webhook-secret': SECRET }), deps)
  assert.deepEqual(calls.emails, ['driver@example.com'])
})
