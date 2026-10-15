// Customer receipt wording keeps payment status and method apart (Fix 4).
// Run: npm run test:functions
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { receiptPaymentLine, receiptTitle } from '../_shared/receiptWording.ts'

const cases: Array<[string, Record<string, unknown>, string, string]> = [
  ['prepaid by card (Stripe)', { payment_status: 'Paid', payment_method: 'Card' }, 'Paid by card', 'Journey receipt'],
  ['office confirmed cash', { payment_status: 'Paid', payment_method: 'Cash' }, 'Paid in cash', 'Journey receipt'],
  ['office confirmed bank transfer', { payment_status: 'paid', payment_method: 'Bank Transfer' }, 'Paid by bank transfer', 'Journey receipt'],
  ['paid via payment link', { payment_status: 'Paid', payment_method: 'payment link' }, 'Paid by card', 'Journey receipt'],
  ['account customer', { payment_status: 'Invoiced', payment_method: 'Bank Transfer' }, 'Invoiced to your account', 'Journey summary'],
  ['driver recorded cash, not yet confirmed', { payment_status: 'Unpaid', payment_method: 'Cash' }, 'Cash to your driver', 'Journey summary'],
  ['driver recorded card machine, not yet confirmed', { payment_status: 'Unpaid', payment_method: 'Card' }, 'Card, confirmation to follow', 'Journey summary'],
  ['bank transfer outstanding', { payment_status: 'Unpaid', payment_method: 'Bank Transfer' }, 'Bank transfer, awaiting payment', 'Journey summary'],
  ['payment link outstanding', { payment_status: 'Unpaid', payment_method: 'payment link' }, 'Payment link sent, awaiting payment', 'Journey summary'],
  ['nothing recorded', { payment_status: null, payment_method: null }, 'Payment due', 'Journey summary'],
  ['return leg', { payment_status: 'Unpaid', notes: 'Return leg created automatically. Outbound ref: EVX-ABC.' }, 'Included with booking EVX-ABC', 'Journey receipt'],
]

for (const [name, b, line, title] of cases) {
  test(name, () => {
    assert.equal(receiptPaymentLine(b), line)
    assert.equal(receiptTitle(b), title)
  })
}

test('an unconfirmed booking never says Paid', () => {
  for (const m of ['Card', 'Cash', 'Bank Transfer', 'payment link', null]) {
    assert.doesNotMatch(receiptPaymentLine({ payment_status: 'Unpaid', payment_method: m }), /paid/i)
  }
})
