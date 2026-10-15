// What a customer's journey receipt says about payment. Payment STATUS (has
// the office confirmed the money?) and payment METHOD (how the customer pays)
// are separate: a driver recording "Card" on the card machine sets the
// method only; the booking stays Unpaid until the office confirms it (audit
// H-3). So only a Paid booking is called a receipt or says "Paid".

export interface ReceiptPaymentFields {
  payment_status?: unknown
  payment_method?: unknown
  notes?: unknown
}

export type ReceiptKind = 'paid' | 'invoiced' | 'included' | 'unconfirmed'

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()

function returnLegRef(notes: unknown): string | null | undefined {
  const s = String(notes ?? '')
  if (!/^Return leg created automatically/i.test(s)) return undefined
  return s.match(/Outbound ref:\s*(\S+)/i)?.[1]?.replace(/[.,]$/, '') ?? null
}

export function receiptKind(b: ReceiptPaymentFields): ReceiptKind {
  if (returnLegRef(b.notes) !== undefined) return 'included'
  const st = norm(b.payment_status)
  if (st === 'paid') return 'paid'
  if (st === 'invoiced') return 'invoiced'
  return 'unconfirmed'
}

/** The "Payment" row on the customer's receipt. */
export function receiptPaymentLine(b: ReceiptPaymentFields): string {
  const ref = returnLegRef(b.notes)
  if (ref !== undefined) return ref ? `Included with booking ${ref}` : 'Included with your outbound booking'
  const m = norm(b.payment_method)
  const bank = m === 'bank transfer' || m === 'bank_transfer'
  switch (receiptKind(b)) {
    case 'paid':
      return m === 'card' || m === 'payment link' ? 'Paid by card' : m === 'cash' ? 'Paid in cash' : bank ? 'Paid by bank transfer' : 'Paid'
    case 'invoiced':
      return 'Invoiced to your account'
    default:
      if (m === 'cash') return 'Cash to your driver'
      if (m === 'card') return 'Card, confirmation to follow'
      if (bank) return 'Bank transfer, awaiting payment'
      if (m === 'payment link') return 'Payment link sent, awaiting payment'
      return 'Payment due'
  }
}

/** Heading, pill and subject wording: a receipt only once it's Paid. */
export function receiptTitle(b: ReceiptPaymentFields): string {
  const k = receiptKind(b)
  return k === 'paid' || k === 'included' ? 'Journey receipt' : 'Journey summary'
}
