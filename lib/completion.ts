// What the Driver App writes when a driver completes a job.
//
// Fix 4 (audit H-3, 15/10/2026): choosing a payment method no longer marks a
// booking Paid. Before, Card or Bank Transfer set payment_status = 'Paid'
// with nothing to check the money arrived, and overwrote 'Invoiced' for
// account customers. Now:
//   - already settled (Paid online, or Invoiced to an account): nothing to
//     collect; payment status and method are left exactly as they are;
//   - otherwise: the driver records HOW the customer paid (payment_method);
//     payment_status is never written by the Driver App. The office (or the
//     Stripe webhook) marks it Paid once the money is confirmed.
// Plain TypeScript with no imports so it can be tested with Node.

export type CollectMethod = 'Cash' | 'Card' | 'Bank Transfer'

export type Settled = 'paid' | 'invoiced' | null

/** 'paid' / 'invoiced' when there is nothing for the driver to collect. */
export function settledState(paymentStatus: string | null | undefined): Settled {
  const s = String(paymentStatus ?? '').trim().toLowerCase()
  if (s === 'paid') return 'paid'
  if (s === 'invoiced') return 'invoiced'
  return null
}

/**
 * The bookings update for "Complete Journey". `method` is what the driver
 * picked; it is ignored for settled bookings and may be null for them.
 */
export function completionPatch(
  booking: { payment_status: string | null | undefined },
  method: CollectMethod | null,
  nowIso: string,
): Record<string, string> {
  const patch: Record<string, string> = { status: 'Completed', completed_at: nowIso, updated_at: nowIso }
  if (settledState(booking.payment_status)) return patch
  if (method) patch.payment_method = method
  return patch
}
