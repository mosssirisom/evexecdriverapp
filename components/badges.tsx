import type { BookingStatus } from '@/lib/types'

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const config: Record<BookingStatus, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'bg-amber-100 text-amber-800 border-amber-200' },
    accepted: { label: 'Accepted', className: 'bg-blue-100 text-blue-800 border-blue-200' },
    confirmed: { label: 'Confirmed', className: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
    Dispatched: { label: 'Dispatched', className: 'bg-blue-100 text-blue-800 border-blue-200' },
    'En Route': { label: 'En Route', className: 'bg-purple-100 text-purple-800 border-purple-200' },
    en_route: { label: 'En Route', className: 'bg-purple-100 text-purple-800 border-purple-200' },
    Arrived: { label: 'Arrived', className: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
    arrived: { label: 'Arrived', className: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
    Active: { label: 'On Board', className: 'bg-green-100 text-green-800 border-green-200' },
    active: { label: 'On Board', className: 'bg-green-100 text-green-800 border-green-200' },
    'Passenger On Board': { label: 'On Board', className: 'bg-green-100 text-green-800 border-green-200' },
    completed: { label: 'Completed', className: 'bg-[#dce8f2] text-[#4f6580] border-[#c4d4e4]' },
    Completed: { label: 'Completed', className: 'bg-[#dce8f2] text-[#4f6580] border-[#c4d4e4]' },
    rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800 border-red-200' },
    cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-800 border-red-200' },
    Cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-800 border-red-200' },
    'No Show': { label: 'No Show', className: 'bg-amber-100 text-amber-800 border-amber-200' },
    CRITICAL_UNALLOCATED: { label: 'Needs Driver', className: 'bg-red-100 text-red-800 border-red-200' },
  }
  const c = config[status]
  if (!c) return null
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${c.className}`}>
      {c.label}
    </span>
  )
}
