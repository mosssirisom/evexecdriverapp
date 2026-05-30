'use client'

import { useState, use } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Phone,
  Navigation2,
  MapPin,
  Clock,
  Car,
  User,
  FileText,
  CheckCircle2,
  AlertOctagon,
  ChevronRight,
} from 'lucide-react'
import { MOCK_JOBS } from '@/lib/mock-data'
import { JobStatusBadge, PriorityBadge } from '@/components/badges'
import type { JobStatus } from '@/lib/types'

const STATUS_FLOW: { from: JobStatus; to: JobStatus; label: string; color: string }[] = [
  { from: 'assigned', to: 'en_route', label: 'Start — Head to Pickup', color: '#6366f1' },
  { from: 'en_route', to: 'arrived', label: 'Arrived at Pickup', color: '#06b6d4' },
  { from: 'arrived', to: 'in_progress', label: 'Passenger On Board', color: '#10b981' },
  { from: 'in_progress', to: 'completed', label: 'Complete Job', color: '#d5a538' },
]

const PROGRESS_STEPS: JobStatus[] = ['assigned', 'en_route', 'arrived', 'in_progress', 'completed']

function openMaps(address: string) {
  const encoded = encodeURIComponent(address)
  window.open(`https://maps.google.com/?q=${encoded}`, '_blank')
}

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const originalJob = MOCK_JOBS.find((j) => j.id === id)
  const [status, setStatus] = useState<JobStatus>(originalJob?.status ?? 'scheduled')

  if (!originalJob) {
    return (
      <div className="min-h-screen bg-[#020813] flex items-center justify-center">
        <p className="text-white/40">Job not found</p>
      </div>
    )
  }

  const job = { ...originalJob, status }
  const nextStep = STATUS_FLOW.find((s) => s.from === status)
  const isDone = status === 'completed' || status === 'cancelled'
  const progressIndex = PROGRESS_STEPS.indexOf(status)

  return (
    <div className="min-h-screen bg-[#020813] pb-6">
      {/* Header */}
      <div className="px-4 pt-12 pb-4 flex items-center gap-3 border-b border-white/5">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center">
          <ArrowLeft size={18} className="text-white/70" />
        </button>
        <div className="flex-1">
          <h1 className="text-white font-semibold text-base">{id}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <JobStatusBadge status={status} />
            <PriorityBadge priority={job.priority} />
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Progress Steps */}
        {!isDone && status !== 'scheduled' && (
          <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4">
            <div className="flex items-center justify-between relative">
              {PROGRESS_STEPS.slice(0, -1).map((step, i) => {
                const done = i < progressIndex
                const current = i === progressIndex
                return (
                  <div key={step} className="flex flex-col items-center gap-1 relative z-10">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                      style={{
                        background: done || current ? 'linear-gradient(135deg, #f1c56a, #d5a538)' : 'rgba(255,255,255,0.1)',
                        color: done || current ? '#020813' : 'rgba(255,255,255,0.3)',
                      }}
                    >
                      {done ? '✓' : i + 1}
                    </div>
                    <span className="text-[8px] text-white/40 capitalize text-center" style={{ maxWidth: 48 }}>
                      {step.replace('_', ' ')}
                    </span>
                  </div>
                )
              })}
              <div className="absolute top-3 left-3 right-3 h-px bg-white/10" />
            </div>
          </div>
        )}

        {/* Passenger */}
        <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-3">Passenger</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/8 flex items-center justify-center">
                <User size={18} className="text-white/50" />
              </div>
              <div>
                <p className="text-white font-medium text-sm">{job.passenger.name}</p>
                <p className="text-white/40 text-xs">{job.passenger.company}</p>
              </div>
            </div>
            {job.passenger.phone && (
              <a
                href={`tel:${job.passenger.phone}`}
                className="w-10 h-10 rounded-xl flex items-center justify-center border border-white/10 bg-white/5"
              >
                <Phone size={16} className="text-[#d5a538]" />
              </a>
            )}
          </div>
        </div>

        {/* Route */}
        <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-3">Route</p>
          <div className="space-y-3">
            {/* Pickup */}
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center gap-1 flex-shrink-0 mt-0.5">
                <div className="w-3 h-3 rounded-full bg-[#10b981]" />
                <div className="w-px h-4 bg-white/10" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/40 text-[10px] uppercase tracking-wider mb-0.5">
                  Pickup · {job.pickup.time}
                </p>
                <p className="text-white text-sm font-medium">{job.pickup.name}</p>
                <p className="text-white/40 text-xs mt-0.5 leading-tight">{job.pickup.address}</p>
                <button
                  onClick={() => openMaps(job.pickup.address)}
                  className="mt-2 text-[10px] text-[#d5a538] font-medium flex items-center gap-1"
                >
                  <Navigation2 size={10} /> Navigate
                </button>
              </div>
            </div>

            {/* Stops */}
            {job.stops?.map((stop, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1 flex-shrink-0 mt-0.5">
                  <div className="w-3 h-3 rounded-full bg-[#d5a538]" />
                  <div className="w-px h-4 bg-white/10" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white/40 text-[10px] uppercase tracking-wider mb-0.5">
                    Stop {i + 1} · {stop.time}
                  </p>
                  <p className="text-white text-sm font-medium">{stop.name}</p>
                  <p className="text-white/40 text-xs mt-0.5 leading-tight">{stop.address}</p>
                </div>
              </div>
            ))}

            {/* Dropoff */}
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/40 text-[10px] uppercase tracking-wider mb-0.5">Drop-off</p>
                <p className="text-white text-sm font-medium">{job.dropoff.name}</p>
                <p className="text-white/40 text-xs mt-0.5 leading-tight">{job.dropoff.address}</p>
                <button
                  onClick={() => openMaps(job.dropoff.address)}
                  className="mt-2 text-[10px] text-[#d5a538] font-medium flex items-center gap-1"
                >
                  <Navigation2 size={10} /> Navigate
                </button>
              </div>
            </div>
          </div>

          {/* Meta */}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/5">
            <span className="text-white/40 text-xs flex items-center gap-1">
              <Clock size={12} /> {job.estimatedDuration}
            </span>
            <span className="text-white/40 text-xs flex items-center gap-1">
              <MapPin size={12} /> {job.distance}
            </span>
            <span className="ml-auto text-[#d5a538] font-bold">£{job.fare.toFixed(2)}</span>
          </div>
        </div>

        {/* Vehicle */}
        <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2">Vehicle Required</p>
          <div className="flex items-center gap-2">
            <Car size={16} className="text-white/50" />
            <span className="text-white text-sm">{job.vehicleRequired}</span>
          </div>
        </div>

        {/* Notes */}
        {job.notes && (
          <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2 flex items-center gap-1.5">
              <FileText size={11} /> Dispatch Notes
            </p>
            <p className="text-white/70 text-sm leading-relaxed">{job.notes}</p>
          </div>
        )}

        {/* Completed Banner */}
        {status === 'completed' && (
          <div className="bg-green-500/10 border border-green-500/25 rounded-2xl p-5 text-center">
            <CheckCircle2 size={28} className="mx-auto mb-2 text-green-400" />
            <p className="text-green-400 font-semibold">Job Completed</p>
            <p className="text-green-400/60 text-xs mt-1">Fare: £{job.fare.toFixed(2)}</p>
          </div>
        )}

        {/* Action Button */}
        {nextStep && (
          <button
            onClick={() => setStatus(nextStep.to)}
            className="w-full py-4 rounded-2xl font-bold text-[#020813] text-base flex items-center justify-center gap-2 shadow-lg"
            style={{ background: `linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)` }}
          >
            {nextStep.label}
            <ChevronRight size={18} />
          </button>
        )}

        {/* SOS / Cancel */}
        {!isDone && (
          <div className="flex gap-3">
            <a
              href="tel:999"
              className="flex-1 py-3 rounded-xl font-semibold text-red-400 text-sm flex items-center justify-center gap-2 bg-red-500/10 border border-red-500/20"
            >
              <AlertOctagon size={15} /> SOS
            </a>
            {status === 'scheduled' || status === 'assigned' ? (
              <button
                onClick={() => setStatus('cancelled')}
                className="flex-1 py-3 rounded-xl font-semibold text-white/40 text-sm bg-white/5 border border-white/8"
              >
                Cancel Job
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
