export function paymentInfo(method: string | null | undefined, status: string | null | undefined): { text: string; className: string } {
  const m = (method ?? '').toLowerCase()
  const s = (status ?? '').toLowerCase()
  if (s === 'paid') return { text: '✓ Paid', className: 'bg-green-500/15 text-green-400' }
  if (m.includes('cash')) return { text: 'Collect Cash', className: 'bg-amber-500/15 text-amber-400' }
  if (m.includes('card') || m.includes('stripe')) return { text: 'Card on Arrival', className: 'bg-blue-500/15 text-blue-400' }
  if (m.includes('account')) return { text: 'On Account', className: 'bg-purple-500/15 text-purple-400' }
  if (method) return { text: method, className: 'bg-white/8 text-white/40' }
  return { text: 'Cash/Card TBC', className: 'bg-amber-500/15 text-amber-400' }
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatTime(timeStr: string | null | undefined): string {
  if (!timeStr) return '—'
  return timeStr.slice(0, 5)
}
