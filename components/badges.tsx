import type { BookingStatus } from '@/lib/types'

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const config: Record<BookingStatus, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
    accepted: { label: 'Accepted', className: 'bg-blue-500/15 text-blue-400 border-blue-500/25' },
    confirmed: { label: 'Confirmed', className: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25' },
    en_route: { label: 'En Route', className: 'bg-purple-500/15 text-purple-400 border-purple-500/25' },
    arrived: { label: 'Arrived', className: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25' },
    active: { label: 'On Board', className: 'bg-green-500/15 text-green-400 border-green-500/25' },
    completed: { label: 'Completed', className: 'bg-white/8 text-white/40 border-white/10' },
    rejected: { label: 'Rejected', className: 'bg-red-500/15 text-red-400 border-red-500/25' },
    cancelled: { label: 'Cancelled', className: 'bg-red-500/15 text-red-400 border-red-500/25' },
  }
  const c = config[status]
  if (!c) return null
  return (
    <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${c.className}`}>
      {c.label}
    </span>
  )
}
