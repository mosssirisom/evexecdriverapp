// The £0 return leg of a return booking (website or Operator app). Its fare
// was paid with the outbound booking, so there is nothing to collect.
export function isReturnLeg(notes: string | null | undefined): boolean {
  return /^Return leg created automatically/i.test(notes ?? '')
}

export function paymentInfo(method: string | null | undefined, status: string | null | undefined, notes?: string | null): { text: string; className: string } {
  const m = (method ?? '').toLowerCase()
  const s = (status ?? '').toLowerCase()
  if (isReturnLeg(notes)) return { text: 'Paid with Outbound', className: 'bg-green-100 text-green-800' }
  if (s === 'paid') return { text: '✓ Paid', className: 'bg-green-100 text-green-800' }
  if (m.includes('cash')) return { text: 'Collect Cash', className: 'bg-amber-100 text-amber-800' }
  // Card, bank transfer and payment links are settled with the office, never
  // collected by the driver (same rule as the website's driver emails).
  if (m.includes('card') || m.includes('stripe') || m.includes('link') || m.includes('bank')) return { text: 'Paid to Office', className: 'bg-blue-100 text-blue-800' }
  if (m.includes('account')) return { text: 'On Account', className: 'bg-purple-100 text-purple-800' }
  if (method) return { text: method, className: 'bg-[#dce8f2] text-[#4f6580]' }
  return { text: 'Cash/Card TBC', className: 'bg-amber-100 text-amber-800' }
}

/** Today's date in the UK as YYYY-MM-DD (not UTC, which is a day behind after midnight in summer). */
export function ukToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now)
}

// House date style (user decision, 2026-10-04): DD/MM/YYYY, 24-hour HH:MM.
// Plain YYYY-MM-DD dates are rearranged directly, so no timezone can shift them.
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : dateStr
}

/** A timestamp as DD/MM/YYYY in UK time. */
export function formatStampDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/London' })
}

/** A timestamp as HH:MM (24-hour) in UK time. */
export function formatStampTime(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/London' })
}

/** A timestamp as DD/MM/YYYY HH:MM in UK time. */
export function formatStamp(iso: string | Date): string {
  return `${formatStampDate(iso)} ${formatStampTime(iso)}`
}

export function formatTime(timeStr: string | null | undefined): string {
  if (!timeStr) return '—'
  return timeStr.slice(0, 5)
}
