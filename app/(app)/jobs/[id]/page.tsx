'use client'

import { useState, use, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Phone,
  Navigation2,
  Clock,
  User,
  FileText,
  CheckCircle2,
  AlertOctagon,
  ChevronRight,
  Loader2,
  Users,
  Luggage,
  PlaneLanding,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BookingStatusBadge } from '@/components/badges'
import { formatDate, formatTime } from '@/lib/format'
import type { Booking, BookingStatus } from '@/lib/types'

type StatusStep = { from: BookingStatus; to: BookingStatus; label: string }

const STATUS_FLOW: StatusStep[] = [
  { from: 'accepted', to: 'en_route', label: 'Start — Head to Pickup' },
  { from: 'confirmed', to: 'en_route', label: 'Start — Head to Pickup' },
  { from: 'en_route', to: 'arrived', label: 'Arrived at Pickup' },
  { from: 'arrived', to: 'active', label: 'Passenger On Board' },
  { from: 'active', to: 'completed', label: 'Complete Job' },
]

const PROGRESS_STEPS: BookingStatus[] = ['en_route', 'arrived', 'active', 'completed']

function openMaps(address: string) {
  const encoded = encodeURIComponent(address)
  window.open(`https://maps.google.com/?q=${encoded}`, '_blank')
}

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  const loadBooking = useCallback(async () => {
    const { data } = await supabase.from('bookings').select('*').eq('id', id).single()
    if (data) setBooking(data)
    setLoading(false)
  }, [id, supabase])

  useEffect(() => { loadBooking() }, [loadBooking])

  const handleStatusUpdate = async (nextStatus: BookingStatus) => {
    if (!booking || updating) return
    setUpdating(true)
    const { error } = await supabase
      .from('bookings')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', booking.id)
    if (!error) {
      setBooking({ ...booking, status: nextStatus })
    }
    setUpdating(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020813] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#d5a538] border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-[#020813] flex items-center justify-center">
        <p className="text-white/40">Booking not found</p>
      </div>
    )
  }

  const nextStep = STATUS_FLOW.find((s) => s.from === booking.status)
  const isDone = booking.status === 'completed' || booking.status === 'cancelled' || booking.status === 'rejected'
  const progressIndex = PROGRESS_STEPS.indexOf(booking.status)
  const showProgress = ['en_route', 'arrived', 'active', 'completed'].includes(booking.status)

  const pickupAddress = booking.pickup_location ?? booking.airport ?? '—'
  const dropoffAddress = booking.dropoff_address ?? '—'
  const bookingRef = booking.id.slice(0, 8).toUpperCase()

  return (
    <div className="min-h-screen bg-[#020813] pb-6">
      {/* Header */}
      <div className="px-4 pt-12 pb-4 flex items-center gap-3 border-b border-white/5">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center"
        >
          <ArrowLeft size={18} className="text-white/70" />
        </button>
        <div className="flex-1">
          <h1 className="text-white font-semibold text-base">{bookingRef}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <BookingStatusBadge status={booking.status} />
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Progress Steps */}
        {showProgress && (
          <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4">
            <div className="flex items-center justify-between relative">
              {PROGRESS_STEPS.slice(0, -1).map((step, i) => {
                const done = i < progressIndex
                const current = i === progressIndex
                const stepLabels: Record<string, string> = {
                  en_route: 'En Route',
                  arrived: 'Arrived',
                  active: 'On Board',
                }
                return (
                  <div key={step} className="flex flex-col items-center gap-1 relative z-10">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                      style={{
                        background:
                          done || current
                            ? 'linear-gradient(135deg, #f1c56a, #d5a538)'
                            : 'rgba(255,255,255,0.1)',
                        color: done || current ? '#020813' : 'rgba(255,255,255,0.3)',
                      }}
                    >
                      {done ? '✓' : i + 1}
                    </div>
                    <span className="text-[8px] text-white/40 text-center" style={{ maxWidth: 52 }}>
                      {stepLabels[step] ?? step}
                    </span>
                  </div>
                )
              })}
              <div className="absolute top-3 left-3 right-3 h-px bg-white/10" />
            </div>
          </div>
        )}

        {/* Customer */}
        <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-3">Passenger</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/8 flex items-center justify-center">
                <User size={18} className="text-white/50" />
              </div>
              <div>
                <p className="text-white font-medium text-sm">{booking.customer_name}</p>
                {booking.customer_email && (
                  <p className="text-white/40 text-xs mt-0.5">{booking.customer_email}</p>
                )}
              </div>
            </div>
            {booking.customer_phone && (
              <a
                href={`tel:${booking.customer_phone}`}
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
                  Pickup
                  {booking.travel_time ? ` · ${formatTime(booking.travel_time)}` : ''}
                  {booking.travel_date ? ` · ${formatDate(booking.travel_date)}` : ''}
                </p>
                <p className="text-white text-sm font-medium">{pickupAddress}</p>
                {booking.flight_number && (
                  <p className="text-white/40 text-xs mt-0.5 flex items-center gap-1">
                    <PlaneLanding size={10} /> Flight {booking.flight_number}
                  </p>
                )}
                <button
                  onClick={() => openMaps(pickupAddress)}
                  className="mt-2 text-[10px] text-[#d5a538] font-medium flex items-center gap-1"
                >
                  <Navigation2 size={10} /> Navigate
                </button>
              </div>
            </div>

            {/* Dropoff */}
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/40 text-[10px] uppercase tracking-wider mb-0.5">Drop-off</p>
                <p className="text-white text-sm font-medium">{dropoffAddress}</p>
                <button
                  onClick={() => openMaps(dropoffAddress)}
                  className="mt-2 text-[10px] text-[#d5a538] font-medium flex items-center gap-1"
                >
                  <Navigation2 size={10} /> Navigate
                </button>
              </div>
            </div>
          </div>

          {/* Meta */}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/5 flex-wrap">
            {booking.passengers > 0 && (
              <span className="text-white/40 text-xs flex items-center gap-1">
                <Users size={12} /> {booking.passengers} pax
              </span>
            )}
            {booking.luggage && (
              <span className="text-white/40 text-xs flex items-center gap-1">
                <Luggage size={12} /> {booking.luggage}
              </span>
            )}
            {booking.quoted_price != null && (
              <span className="ml-auto text-[#d5a538] font-bold text-base">
                £{booking.quoted_price.toFixed(2)}
              </span>
            )}
          </div>
        </div>

        {/* Return journey indicator */}
        {booking.return_journey && (
          <div className="bg-[#0B1525] border border-white/8 rounded-xl px-4 py-3">
            <p className="text-white/50 text-xs">↩ Return journey included</p>
          </div>
        )}

        {/* Notes */}
        {(booking.operator_note || booking.driver_notes) && (
          <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2 flex items-center gap-1.5">
              <FileText size={11} /> Notes
            </p>
            {booking.operator_note && (
              <p className="text-white/70 text-sm leading-relaxed">{booking.operator_note}</p>
            )}
            {booking.driver_notes && (
              <p className="text-white/50 text-xs leading-relaxed mt-1">{booking.driver_notes}</p>
            )}
          </div>
        )}

        {/* Completed Banner */}
        {booking.status === 'completed' && (
          <div className="bg-green-500/10 border border-green-500/25 rounded-2xl p-5 text-center">
            <CheckCircle2 size={28} className="mx-auto mb-2 text-green-400" />
            <p className="text-green-400 font-semibold">Job Completed</p>
            {booking.quoted_price && (
              <p className="text-green-400/60 text-xs mt-1">£{booking.quoted_price.toFixed(2)}</p>
            )}
          </div>
        )}

        {/* Action Button */}
        {nextStep && (
          <button
            onClick={() => handleStatusUpdate(nextStep.to)}
            disabled={updating}
            className="w-full py-4 rounded-2xl font-bold text-[#020813] text-base flex items-center justify-center gap-2 shadow-lg disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)' }}
          >
            {updating ? <Loader2 size={18} className="animate-spin" /> : null}
            {nextStep.label}
            {!updating && <ChevronRight size={18} />}
          </button>
        )}

        {/* SOS */}
        {!isDone && (
          <a
            href="tel:999"
            className="w-full py-3 rounded-xl font-semibold text-red-400 text-sm flex items-center justify-center gap-2 bg-red-500/10 border border-red-500/20"
          >
            <AlertOctagon size={15} /> SOS
          </a>
        )}
      </div>
    </div>
  )
}
