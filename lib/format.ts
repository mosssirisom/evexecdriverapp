export function paymentInfo(method: string | null | undefined, status: string | null | undefined): { text: string; className: string } {
  const m = (method ?? '').toLowerCase()
  const s = (status ?? '').toLowerCase()
  if (s === 'paid') return { text: '✓ Paid', className: 'bg-green-500/15 text-green-400' }
  if (m.includes('cash')) return { text: 'Collect Cash', className: 'bg-amber-500/15 text-amber-400' }
  if (m.includes('card') || m.includes('stripe')) return { text: 'Card on Arrival', className: 'bg-blue-500/15 text-blue-400' }
  if (m.includes('account')) return { text: 'On Account', className: 'bg-purple-500/15 text-purple-400' }
  if (method) return { text: method, className: 'bg-[#dce8f2] text-[#7a9ab8]' }
  return { text: 'Cash/Card TBC', className: 'bg-amber-500/15 text-amber-400' }
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
