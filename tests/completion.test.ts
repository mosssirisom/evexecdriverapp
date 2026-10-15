// Fix 4 (audit H-3): completing a job never marks it Paid, and leaves
// prepaid and invoiced bookings exactly as they are.
// Run: npm run test:unit   (node --test --experimental-strip-types)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { completionPatch, settledState } from '../lib/completion.ts'

const NOW = '2026-10-15T10:00:00.000Z'
const base = { status: 'Completed', completed_at: NOW, updated_at: NOW }

test('card on an unpaid job records the method only; never sets Paid', () => {
  const p = completionPatch({ payment_status: 'Unpaid' }, 'Card', NOW)
  assert.deepEqual(p, { ...base, payment_method: 'Card' })
  assert.equal('payment_status' in p, false)
})

test('bank transfer on an unpaid job records the method only', () => {
  assert.deepEqual(completionPatch({ payment_status: 'Unpaid' }, 'Bank Transfer', NOW), { ...base, payment_method: 'Bank Transfer' })
})

test('cash on an unpaid job records Cash', () => {
  assert.deepEqual(completionPatch({ payment_status: 'Unpaid' }, 'Cash', NOW), { ...base, payment_method: 'Cash' })
})

test('invoiced (account) job: status stays Invoiced and method is untouched, whatever the driver picked', () => {
  for (const m of ['Card', 'Cash', 'Bank Transfer', null] as const) {
    assert.deepEqual(completionPatch({ payment_status: 'Invoiced' }, m, NOW), base)
  }
})

test('prepaid job: a driver tapping Cash cannot overwrite the card payment', () => {
  assert.deepEqual(completionPatch({ payment_status: 'Paid' }, 'Cash', NOW), base)
  assert.deepEqual(completionPatch({ payment_status: 'paid' }, 'Cash', NOW), base)
})

test('missing or legacy payment status is treated as unpaid', () => {
  assert.deepEqual(completionPatch({ payment_status: null }, 'Card', NOW), { ...base, payment_method: 'Card' })
  assert.deepEqual(completionPatch({ payment_status: 'pending' }, 'Cash', NOW), { ...base, payment_method: 'Cash' })
})

test('settledState', () => {
  assert.equal(settledState('Paid'), 'paid')
  assert.equal(settledState(' INVOICED '), 'invoiced')
  assert.equal(settledState('Unpaid'), null)
  assert.equal(settledState(undefined), null)
})
