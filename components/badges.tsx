import type { BookingStatus } from '@/lib/types'

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const config: Record<BookingStatus, { label: string; className: string }> = {
    Unassigned: { label: 'Unassigned', className: 'bg-white/8 text-white/50 border-white/15' },
    'Unassigned / Missed Call Recovery': { label: 'Missed Call', className: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
    Dispatched: { label: 'Dispatched', className: 'bg-blue-500/15 text-blue-400 border-blue-500/25' },
    'En Route': { label: 'En Route', className: 'bg-purple-500/15 text-purple-400 border-purple-500/25' },
    Arrived: { label: 'Arrived', className: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25' },
    'Passenger On Board': { label: 'On Board', className: 'bg-green-500/15 text-green-400 border-green-500/25' },
    Completed: { label: 'Completed', className: 'bg-white/8 text-white/40 border-white/10' },
    Cancelled: { label: 'Cancelled', className: 'bg-red-500/15 text-red-400 border-red-500/25' },
    CRITICAL_UNALLOCATED: { label: 'Needs Driver', className: 'bg-red-600/20 text-red-300 border-red-600/40' },
  }
  const c = config[status]
  if (!c) return null
  return (
    <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${c.className}`}>
      {c.label}
    </span>
  )
}
