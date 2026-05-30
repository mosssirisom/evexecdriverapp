'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Clock, MapPin } from 'lucide-react'
import { MOCK_JOBS } from '@/lib/mock-data'
import { JobStatusBadge, PriorityBadge } from '@/components/badges'
import type { Job } from '@/lib/types'

type Tab = 'today' | 'upcoming' | 'completed'

function JobCard({ job }: { job: Job }) {
  return (
    <Link href={`/jobs/${job.id}`}>
      <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4 active:opacity-80 transition-opacity">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[#d5a538] font-semibold text-sm">{job.scheduledTime}</span>
            <PriorityBadge priority={job.priority} />
          </div>
          <div className="flex items-center gap-2">
            <JobStatusBadge status={job.status} />
            <ChevronRight size={14} className="text-white/30" />
          </div>
        </div>

        <p className="text-white font-medium text-sm mb-0.5">{job.passenger.name}</p>
        <p className="text-white/30 text-xs mb-3">{job.passenger.company}</p>

        <div className="space-y-1.5">
          <div className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] mt-1.5 flex-shrink-0" />
            <p className="text-white/50 text-xs leading-tight">{job.pickup.name || job.pickup.address}</p>
          </div>
          {job.stops?.map((stop, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#d5a538] mt-1.5 flex-shrink-0" />
              <p className="text-white/50 text-xs leading-tight">{stop.name}</p>
            </div>
          ))}
          <div className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
            <p className="text-white/50 text-xs leading-tight">{job.dropoff.name || job.dropoff.address}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/5">
          <span className="text-white/40 text-xs flex items-center gap-1">
            <Clock size={11} /> {job.estimatedDuration}
          </span>
          <span className="text-white/40 text-xs flex items-center gap-1">
            <MapPin size={11} /> {job.distance}
          </span>
          <span className="ml-auto text-[#d5a538] font-semibold text-sm">£{job.fare.toFixed(0)}</span>
        </div>
      </div>
    </Link>
  )
}

export default function JobsPage() {
  const [tab, setTab] = useState<Tab>('today')

  const today = MOCK_JOBS.filter((j) => j.date === '2026-05-30' && j.status !== 'completed' && j.status !== 'cancelled')
  const upcoming = MOCK_JOBS.filter((j) => j.date > '2026-05-30')
  const completed = MOCK_JOBS.filter((j) => j.status === 'completed' || j.status === 'cancelled')

  const jobs = tab === 'today' ? today : tab === 'upcoming' ? upcoming : completed

  return (
    <div className="min-h-screen bg-[#020813] px-4 pt-12 pb-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-white font-bold text-xl">Jobs</h1>
        <p className="text-white/40 text-xs mt-1">30 May 2026</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-5">
        {(['today', 'upcoming', 'completed'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-all ${
              tab === t
                ? 'text-[#020813]'
                : 'text-white/40 hover:text-white/60'
            }`}
            style={tab === t ? { background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)' } : {}}
          >
            {t === 'today' ? `Today (${today.length})` : t === 'upcoming' ? 'Upcoming' : 'Completed'}
          </button>
        ))}
      </div>

      {/* Job list */}
      {jobs.length === 0 ? (
        <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-10 text-center">
          <p className="text-white/30 text-sm">No {tab} jobs</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  )
}
