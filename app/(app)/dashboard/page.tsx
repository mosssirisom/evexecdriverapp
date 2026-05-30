'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Car,
  MapPin,
  Clock,
  ChevronRight,
  Bell,
  PoundSterling,
  Star,
  Briefcase,
  AlertTriangle,
} from 'lucide-react'
import { MOCK_DRIVER, MOCK_JOBS, TODAY_STATS } from '@/lib/mock-data'
import { JobStatusBadge, PriorityBadge } from '@/components/badges'

export default function DashboardPage() {
  const [isOnline, setIsOnline] = useState(true)

  const todayJobs = MOCK_JOBS.filter((j) => j.date === '2026-05-30')
  const upcomingJobs = todayJobs.filter((j) => j.status === 'scheduled' || j.status === 'assigned')
  const activeJob = todayJobs.find((j) => j.status === 'en_route' || j.status === 'in_progress' || j.status === 'arrived')
  const nextJob = upcomingJobs[0]

  return (
    <div className="min-h-screen bg-[#020813] px-4 pt-12 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-white/40 text-xs uppercase tracking-widest">Good morning</p>
          <h1 className="text-white font-semibold text-lg mt-0.5">{MOCK_DRIVER.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/jobs"
            className="relative w-10 h-10 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center"
          >
            <Bell size={18} className="text-white/60" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#d5a538]" />
          </Link>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-semibold text-sm text-[#020813]"
            style={{ background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)' }}>
            {MOCK_DRIVER.name.split(' ').map((n) => n[0]).join('')}
          </div>
        </div>
      </div>

      {/* Online / Offline Toggle */}
      <div
        onClick={() => setIsOnline(!isOnline)}
        className="relative mb-5 rounded-2xl border cursor-pointer overflow-hidden transition-all duration-300 select-none"
        style={{
          background: isOnline
            ? 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))'
            : 'rgba(255,255,255,0.03)',
          borderColor: isOnline ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.08)',
        }}
      >
        <div className="flex items-center justify-between p-5">
          <div>
            <p className="text-xs uppercase tracking-widest font-semibold mb-1"
              style={{ color: isOnline ? '#10b981' : 'rgba(255,255,255,0.3)' }}>
              {isOnline ? '● Online' : '○ Offline'}
            </p>
            <p className="text-white font-semibold text-base">
              {isOnline ? 'Ready for jobs' : 'You are off duty'}
            </p>
            <p className="text-white/40 text-xs mt-0.5">
              {isOnline ? 'Tap to go offline' : 'Tap to go online and receive jobs'}
            </p>
          </div>
          <div
            className="w-14 h-8 rounded-full flex items-center px-1 transition-all duration-300"
            style={{
              background: isOnline
                ? 'linear-gradient(135deg, #10b981, #059669)'
                : 'rgba(255,255,255,0.1)',
            }}
          >
            <div
              className="w-6 h-6 rounded-full bg-white shadow transition-transform duration-300"
              style={{ transform: isOnline ? 'translateX(24px)' : 'translateX(0)' }}
            />
          </div>
        </div>
      </div>

      {/* Active Job Banner */}
      {activeJob && (
        <Link href={`/jobs/${activeJob.id}`}>
          <div className="mb-5 rounded-2xl border border-[#d5a538]/30 p-4"
            style={{ background: 'linear-gradient(135deg, rgba(213,165,56,0.12), rgba(213,165,56,0.04))' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[#d5a538]">
                ● Active Job
              </span>
              <ChevronRight size={16} className="text-[#d5a538]" />
            </div>
            <p className="text-white font-semibold text-sm">{activeJob.passenger.name}</p>
            <p className="text-white/50 text-xs mt-0.5">{activeJob.pickup.address}</p>
          </div>
        </Link>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-[#0B1525] border border-white/8 rounded-xl p-3 text-center">
          <PoundSterling size={16} className="mx-auto mb-1 text-[#d5a538]" />
          <p className="text-white font-bold text-lg">£{TODAY_STATS.earningsToday.toFixed(0)}</p>
          <p className="text-white/30 text-[10px] uppercase tracking-wide mt-0.5">Today</p>
        </div>
        <div className="bg-[#0B1525] border border-white/8 rounded-xl p-3 text-center">
          <Briefcase size={16} className="mx-auto mb-1 text-[#d5a538]" />
          <p className="text-white font-bold text-lg">{TODAY_STATS.jobsScheduled}</p>
          <p className="text-white/30 text-[10px] uppercase tracking-wide mt-0.5">Jobs</p>
        </div>
        <div className="bg-[#0B1525] border border-white/8 rounded-xl p-3 text-center">
          <Star size={16} className="mx-auto mb-1 text-[#d5a538]" />
          <p className="text-white font-bold text-lg">{MOCK_DRIVER.rating}</p>
          <p className="text-white/30 text-[10px] uppercase tracking-wide mt-0.5">Rating</p>
        </div>
      </div>

      {/* Vehicle Inspection Warning */}
      {MOCK_DRIVER.documents.inspection.status === 'expiring_soon' && (
        <div className="mb-5 bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-amber-400 text-xs font-semibold">Inspection Due Soon</p>
            <p className="text-amber-400/70 text-xs mt-0.5">
              Vehicle inspection expires {MOCK_DRIVER.documents.inspection.expiry}
            </p>
          </div>
        </div>
      )}

      {/* Upcoming Jobs */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-white font-semibold text-sm">Today&apos;s Jobs</h2>
        <Link href="/jobs" className="text-[#d5a538] text-xs font-medium">
          View all
        </Link>
      </div>

      {upcomingJobs.length === 0 ? (
        <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-6 text-center">
          <Car size={28} className="mx-auto mb-2 text-white/20" />
          <p className="text-white/40 text-sm">No upcoming jobs today</p>
        </div>
      ) : (
        <div className="space-y-3">
          {upcomingJobs.slice(0, 3).map((job) => (
            <Link key={job.id} href={`/jobs/${job.id}`}>
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

                <p className="text-white font-medium text-sm mb-2">{job.passenger.name}</p>

                <div className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] mt-1.5 flex-shrink-0" />
                    <p className="text-white/50 text-xs leading-tight">{job.pickup.name || job.pickup.address}</p>
                  </div>
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
                  <span className="ml-auto text-[#d5a538] font-semibold text-sm">
                    £{job.fare.toFixed(0)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
