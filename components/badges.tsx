import type { JobStatus, JobPriority } from '@/lib/types'

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const config: Record<JobStatus, { label: string; className: string }> = {
    scheduled: { label: 'Scheduled', className: 'bg-blue-500/15 text-blue-400 border-blue-500/25' },
    assigned: { label: 'Assigned', className: 'bg-[#d5a538]/15 text-[#d5a538] border-[#d5a538]/25' },
    en_route: { label: 'En Route', className: 'bg-purple-500/15 text-purple-400 border-purple-500/25' },
    arrived: { label: 'Arrived', className: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25' },
    in_progress: { label: 'In Progress', className: 'bg-green-500/15 text-green-400 border-green-500/25' },
    completed: { label: 'Completed', className: 'bg-white/8 text-white/40 border-white/10' },
    cancelled: { label: 'Cancelled', className: 'bg-red-500/15 text-red-400 border-red-500/25' },
  }
  const { label, className } = config[status]
  return (
    <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${className}`}>
      {label}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: JobPriority }) {
  const config: Record<JobPriority, { label: string; className: string } | null> = {
    vip: { label: 'VIP', className: 'bg-[#d5a538]/20 text-[#d5a538] border-[#d5a538]/30' },
    priority: { label: 'Priority', className: 'bg-red-500/15 text-red-400 border-red-500/25' },
    standard: null,
  }
  const c = config[priority]
  if (!c) return null
  return (
    <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${c.className}`}>
      {c.label}
    </span>
  )
}
