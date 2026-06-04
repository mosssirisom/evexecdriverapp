'use client'

import { useState, use, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Phone,
  Navigation2,
  User,
  FileText,
  CheckCircle2,
  AlertOctagon,
  ChevronRight,
  Loader2,
  Users,
  Luggage,
  PlaneLanding,
  MessageSquare,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BookingStatusBadge } from '@/components/badges'
import type { Booking, BookingStatus } from '@/lib/types'

type StatusStep = { from: BookingStatus; to: BookingStatus; label: string }

const STATUS_FLOW: StatusStep[] = [
  { from: 'accepted',           to: 'En Route',           label: 'Start — Head to Pickup' },
  { from: 'confirmed',          to: 'En Route',           label: 'Start — Head to Pickup' },
  { from: 'Dispatched',         to: 'En Route',           label: 'Start — Head to Pickup' },
  { from: 'En Route',           to: 'Passenger On Board', label: 'Passenger On Board' },
  { from: 'Passenger On Board', to: 'Completed',          label: 'Complete Job' },
  { from: 'en_route',           to: 'En Route',           label: 'Passenger On Board' },
  { from: 'arrived',            to: 'Passenger On Board', label: 'Passenger On Board' },
  { from: 'active',             to: 'Completed',          label: 'Complete Job' },
]

const ACTIVE_STATUSES: BookingStatus[] = ['Passenger On Board', 'active', 'Active']

function openMaps(address: string) {
  const encoded = encodeURIComponent(address)
  const isApple = /iPad|iPhone|iPod|Mac/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream
  const url = isApple
    ? `maps://?daddr=${encoded}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`
  window.open(url, '_blank')
}

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState('')

  const loadBooking = useCallback(async () => {
    const { data } = await supabase.from('bookings').select('*').eq('id', id).single()
    if (data) setBooking(data)
    setLoading(false)
  }, [id, supabase])

  useEffect(() => { loadBooking() }, [loadBooking])

  const handleStatusUpdate = async (nextStatus: BookingStatus) => {
    if (!booking || updating) return
    setUpdating(true)
    setUpdateError('')
    const { error } = await supabase
      .from('bookings')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', booking.id)
    if (error) {
      setUpdateError(error.message)
    } else {
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
  const isDone = ['completed', 'Completed', 'cancelled', 'Cancelled', 'No Show', 'rejected'].includes(booking.status)
  const isActive = ACTIVE_STATUSES.includes(booking.status)

  const pickupAddress = booking.pickup_location ?? booking.airport ?? '—'
  const dropoffAddress = booking.dropoff_address ?? '—'
  const bookingRef = booking.id.slice(0, 8).toUpperCase()

  // Navigate to dropoff when passenger is on board, otherwise navigate to pickup
  const navigateAddress = isActive ? dropoffAddress : pickupAddress

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
        {/* Passenger */}
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
              <div className="flex items-center gap-2">
                <a
                  href={`sms:${booking.customer_phone}`}
                  className="w-10 h-10 rounded-xl flex items-center justify-center border border-white/10 bg-white/5"
                >
                  <MessageSquare size={16} className="text-white/50" />
                </a>
                <a
                  href={`tel:${booking.customer_phone}`}
                  className="w-10 h-10 rounded-xl flex items-center justify-center border border-white/10 bg-white/5"
                >
                  <Phone size={16} className="text-[#d5a538]" />
                </a>
              </div>
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
                  {booking.travel_time ? ` · ${booking.travel_time}` : ''}
                  {booking.travel_date ? ` · ${booking.travel_date}` : ''}
                </p>
                <p className="text-white text-sm font-medium">{pickupAddress}</p>
                {booking.flight_number && (
                  <a
                    href={`https://www.flightradar24.com/${booking.flight_number.replace(/\s+/g, '').toUpperCase()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/40 text-xs mt-0.5 flex items-center gap-1 hover:text-[#d5a538] transition-colors"
                  >
                    <PlaneLanding size={10} /> Flight {booking.flight_number} — Track Live →
                  </a>
                )}
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
              </div>
            </div>
          </div>

          {/* Meta + single Navigate */}
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-white/5 flex-wrap">
            {booking.passengers > 0 && (
              <span className="text-white/25 text-xs flex items-center gap-1">
                <Users size={11} /> {booking.passengers}
              </span>
            )}
            {booking.luggage && (
              <span className="text-white/25 text-xs flex items-center gap-1">
                <Luggage size={11} /> {booking.luggage}
              </span>
            )}
            {booking.quoted_price != null && (
              <span className="text-[#d5a538] font-bold text-base">
                £{booking.quoted_price.toFixed(2)}
              </span>
            )}
            <button
              onClick={() => openMaps(navigateAddress)}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#020813]"
              style={{ background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)' }}
            >
              <Navigation2 size={13} /> Navigate
            </button>
          </div>
        </div>

        {/* Return journey */}
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
        {['completed', 'Completed'].includes(booking.status) && (
          <div className="bg-green-500/10 border border-green-500/25 rounded-2xl p-5 text-center">
            <CheckCircle2 size={28} className="mx-auto mb-2 text-green-400" />
            <p className="text-green-400 font-semibold">Job Completed</p>
            {booking.quoted_price && (
              <p className="text-green-400/60 text-xs mt-1">£{booking.quoted_price.toFixed(2)}</p>
            )}
          </div>
        )}

        {/* Error */}
        {updateError && (
          <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
            {updateError}
          </p>
        )}

        {/* Primary action */}
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
