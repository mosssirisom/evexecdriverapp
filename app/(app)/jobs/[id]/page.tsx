'use client'

import { useState, use, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Phone, Navigation2, User, FileText, CheckCircle2,
  AlertOctagon, ChevronRight, Loader2, Users, Luggage, PlaneLanding, CreditCard,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BookingStatusBadge } from '@/components/badges'
import { JobMap } from '@/components/job-map'
import { formatDate, formatTime } from '@/lib/format'
import { OPS_PHONE } from '@/lib/config'
import type { Booking, BookingStatus } from '@/lib/types'

type StatusStep = { from: BookingStatus; to: BookingStatus; label: string }

const STATUS_FLOW: StatusStep[] = [
  { from: 'accepted',   to: 'En Route', label: 'Start — Head to Pickup' },
  { from: 'confirmed',  to: 'En Route', label: 'Start — Head to Pickup' },
  { from: 'Dispatched', to: 'En Route', label: 'Start — Head to Pickup' },
  { from: 'En Route',   to: 'Arrived',  label: 'Arrived at Pickup' },
  { from: 'Arrived',    to: 'Active',   label: 'Passenger On Board' },
  { from: 'Active',     to: 'Completed', label: 'Complete Job' },
  // backward-compat for any rows still stored in snake_case
  { from: 'en_route',  to: 'Arrived',   label: 'Arrived at Pickup' },
  { from: 'arrived',   to: 'Active',    label: 'Passenger On Board' },
  { from: 'active',    to: 'Completed', label: 'Complete Job' },
]

const PROGRESS_STEPS: BookingStatus[] = ['En Route', 'Arrived', 'Active', 'Completed']
const STEP_LABELS: Record<string, string> = { 'En Route': 'En Route', 'Arrived': 'Arrived', 'Active': 'On Board' }

function SwipeToConfirm({ label, onConfirm, loading }: { label: string; onConfirm: () => void; loading: boolean }) {
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startXRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const THUMB = 52

  const maxDrag = () => Math.max(0, (containerRef.current?.offsetWidth ?? 320) - THUMB - 8)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (loading) return
    e.currentTarget.setPointerCapture(e.pointerId)
    startXRef.current = e.clientX - dragX
    setDragging(true)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    setDragX(Math.max(0, Math.min(maxDrag(), e.clientX - startXRef.current)))
  }

  const onPointerUp = () => {
    if (!dragging) return
    setDragging(false)
    const max = maxDrag()
    if (dragX >= max * 0.78) {
      setDragX(max)
      onConfirm()
    } else {
      setDragX(0)
    }
  }

  useEffect(() => { if (!loading) setDragX(0) }, [loading])

  const progress = maxDrag() > 0 ? dragX / maxDrag() : 0

  return (
    <div
      ref={containerRef}
      className="relative w-full h-16 rounded-2xl select-none overflow-hidden"
      style={{ background: 'rgba(213,165,56,0.10)', border: '1px solid rgba(213,165,56,0.25)' }}
    >
      {/* Fill */}
      <div
        className="absolute inset-y-0 left-0 rounded-2xl"
        style={{
          width: `${Math.min(100, (dragX + THUMB + 4) / (containerRef.current?.offsetWidth ?? 320) * 100)}%`,
          background: `linear-gradient(90deg, rgba(213,165,56,0.22) 0%, rgba(213,165,56,${0.06 + progress * 0.16}) 100%)`,
          transition: dragging ? 'none' : 'width 0.2s ease',
        }}
      />
      {/* Ghost chevrons */}
      <div className="absolute inset-0 flex items-center justify-end pr-4 pointer-events-none gap-0.5">
        {[0.55, 0.30, 0.12].map((op, i) => (
          <ChevronRight key={i} size={13} style={{ color: `rgba(213,165,56,${op * (1 - progress * 0.9)})` }} />
        ))}
      </div>
      {/* Label */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none pl-14">
        <span className="text-sm font-bold" style={{ color: `rgba(255,255,255,${0.45 + progress * 0.4})` }}>
          {label}
        </span>
      </div>
      {/* Thumb */}
      <div
        className="absolute top-2 rounded-xl flex items-center justify-center touch-none cursor-grab active:cursor-grabbing"
        style={{
          left: `${dragX + 4}px`,
          width: THUMB,
          bottom: 8,
          background: loading ? 'rgba(213,165,56,0.55)' : 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)',
          transition: dragging ? 'none' : 'left 0.2s ease',
          boxShadow: '0 2px 10px rgba(213,165,56,0.35)',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {loading
          ? <Loader2 size={18} className="animate-spin text-[#020813]" />
          : <ChevronRight size={20} className="text-[#020813]" strokeWidth={2.5} />
        }
      </div>
    </div>
  )
}

function navigateTo(destination: string, from?: string) {
  const dest = encodeURIComponent(destination)
  const url = from
    ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${dest}&travelmode=driving`
    : `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`
  window.open(url, '_blank')
}

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [driverNote, setDriverNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [noteSaved, setNoteSaved] = useState(false)

  const loadBooking = useCallback(async () => {
    const { data } = await supabase.from('bookings').select('*').eq('id', id).single()
    if (data) { setBooking(data); setDriverNote(data.driver_notes ?? '') }
    setLoading(false)
  }, [id, supabase])

  useEffect(() => { loadBooking() }, [loadBooking])

  // Live updates when operator edits the booking
  useEffect(() => {
    const channel = supabase
      .channel(`booking-${id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'bookings', filter: `id=eq.${id}`,
      }, (payload) => { setBooking(payload.new as Booking) })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id, supabase])

  const handleStatusUpdate = async (nextStatus: BookingStatus) => {
    if (!booking || updating) return
    setUpdating(true)
    setUpdateError(null)
    const { error } = await supabase
      .from('bookings')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', booking.id)
    if (error) {
      setUpdateError(error.message ?? 'Failed to update. Please try again.')
    } else {
      setBooking({ ...booking, status: nextStatus })
    }
    setUpdating(false)
  }

  const saveNote = async () => {
    if (!booking) return
    setSavingNote(true)
    await supabase.from('bookings').update({ driver_notes: driverNote }).eq('id', booking.id)
    setSavingNote(false)
    setNoteSaved(true)
    setTimeout(() => setNoteSaved(false), 2500)
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
  const isDone = ['completed', 'Completed', 'cancelled', 'Cancelled', 'rejected'].includes(booking.status)
  const progressIndex = PROGRESS_STEPS.indexOf(booking.status as BookingStatus)
  const showProgress = ['En Route', 'Arrived', 'Active', 'Completed', 'en_route', 'arrived', 'active', 'completed'].includes(booking.status)

  const pickupAddress = booking.pickup_location ?? booking.airport ?? '—'
  const dropoffAddress = booking.dropoff_address ?? booking.airport ?? '—'
  const bookingRef = booking.id.slice(0, 8).toUpperCase()
  const noteChanged = driverNote !== (booking.driver_notes ?? '')
  const showNotes = booking.operator_note || !isDone || (isDone && booking.driver_notes)

  return (
    <div className="min-h-screen bg-[#020813] pb-8">
      {/* Header */}
      <div className="px-4 pt-12 pb-4 flex items-center gap-3 border-b border-white/5">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center active:opacity-70"
        >
          <ArrowLeft size={18} className="text-white/70" />
        </button>
        <div className="flex-1">
          <h1 className="text-white font-semibold text-base">{bookingRef}</h1>
          <div className="mt-0.5"><BookingStatusBadge status={booking.status} /></div>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3">

        {/* Progress stepper */}
        {showProgress && (
          <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4">
            <div className="flex items-center justify-between relative">
              {PROGRESS_STEPS.slice(0, -1).map((step, i) => {
                const done = i < progressIndex
                const current = i === progressIndex
                return (
                  <div key={step} className="flex flex-col items-center gap-1 relative z-10">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
                      style={{
                        background: done || current ? 'linear-gradient(135deg, #f1c56a, #d5a538)' : 'rgba(255,255,255,0.08)',
                        color: done || current ? '#020813' : 'rgba(255,255,255,0.25)',
                      }}
                    >
                      {done ? '✓' : i + 1}
                    </div>
                    <span className="text-[9px] text-white/35 text-center" style={{ maxWidth: 56 }}>
                      {STEP_LABELS[step]}
                    </span>
                  </div>
                )
              })}
              <div className="absolute top-3.5 left-4 right-4 h-px bg-white/8" />
            </div>
          </div>
        )}

        {/* Passenger */}
        <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 mb-3">Passenger</p>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
                <User size={18} className="text-white/35" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">{booking.customer_name}</p>
                {booking.customer_email && (
                  <p className="text-white/30 text-xs mt-0.5 truncate max-w-[180px]">{booking.customer_email}</p>
                )}
              </div>
            </div>
            {booking.customer_phone && (
              <a
                href={`tel:${booking.customer_phone}`}
                className="w-10 h-10 rounded-xl flex items-center justify-center border border-white/10 bg-white/5 flex-shrink-0 active:opacity-70"
              >
                <Phone size={16} className="text-[#d5a538]" />
              </a>
            )}
          </div>
        </div>

        {/* Route */}
        <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 mb-4">Route</p>
          <div className="space-y-4">

            {/* Pickup */}
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center gap-1 flex-shrink-0 mt-0.5">
                <div className="w-3 h-3 rounded-full bg-[#10b981]" />
                <div className="w-px h-5 bg-white/10" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/30 text-[10px] uppercase tracking-wider mb-0.5">
                  Pickup{booking.travel_time ? ` · ${formatTime(booking.travel_time)}` : ''}{booking.travel_date ? ` · ${formatDate(booking.travel_date)}` : ''}
                </p>
                <p className="text-white text-sm font-medium leading-snug">{pickupAddress}</p>
                {booking.flight_number && (
                  <p className="text-white/30 text-xs mt-1 flex items-center gap-1">
                    <PlaneLanding size={10} /> Flight {booking.flight_number}
                  </p>
                )}
              </div>
              <button
                onClick={() => navigateTo(pickupAddress)}
                className="flex items-center gap-1.5 text-[#d5a538] text-xs font-semibold flex-shrink-0 bg-[#d5a538]/10 px-3 py-2 rounded-xl active:opacity-70"
              >
                <Navigation2 size={12} /> Go
              </button>
            </div>

            {/* Dropoff */}
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/30 text-[10px] uppercase tracking-wider mb-0.5">Drop-off</p>
                <p className="text-white text-sm font-medium leading-snug">{dropoffAddress}</p>
              </div>
              <button
                onClick={() => navigateTo(dropoffAddress, pickupAddress)}
                className="flex items-center gap-1.5 text-[#d5a538] text-xs font-semibold flex-shrink-0 bg-[#d5a538]/10 px-3 py-2 rounded-xl active:opacity-70"
              >
                <Navigation2 size={12} /> Go
              </button>
            </div>
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-4 pt-3 border-t border-white/5">
            {booking.passengers > 0 && (
              <span className="text-white/35 text-xs flex items-center gap-1">
                <Users size={11} /> {booking.passengers} Passengers
              </span>
            )}
            {booking.luggage && (
              <span className="text-white/35 text-xs flex items-center gap-1">
                <Luggage size={11} /> {booking.luggage.replace(/pieces?/i, 'Bags')}
              </span>
            )}
            {booking.payment_method && (
              <span className="text-white/35 text-xs flex items-center gap-1">
                <CreditCard size={11} /> {booking.payment_method}
              </span>
            )}
            {booking.payment_status && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                booking.payment_status === 'paid'
                  ? 'bg-green-500/15 text-green-400'
                  : 'bg-amber-500/15 text-amber-400'
              }`}>
                {booking.payment_status}
              </span>
            )}
            {booking.quoted_price != null && (
              <span className="ml-auto text-[#d5a538] font-bold text-base">
                £{booking.quoted_price.toFixed(2)}
              </span>
            )}
          </div>
        </div>

        {/* Map */}
        {pickupAddress !== '—' && dropoffAddress !== '—' && (
          <JobMap pickup={pickupAddress} dropoff={dropoffAddress} />
        )}

        {/* Return journey */}
        {booking.return_journey && (
          <div className="bg-[#0B1525] border border-white/8 rounded-xl px-4 py-3">
            <p className="text-white/40 text-xs">↩ Return journey included</p>
          </div>
        )}

        {/* Notes */}
        {showNotes && (
          <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 mb-3 flex items-center gap-1.5">
              <FileText size={11} /> Notes
            </p>

            {booking.operator_note && (
              <div className={!isDone ? 'mb-4' : ''}>
                <p className="text-[10px] text-white/25 mb-1 uppercase tracking-wide">From operator</p>
                <p className="text-white/70 text-sm leading-relaxed">{booking.operator_note}</p>
              </div>
            )}

            {!isDone && (
              <div>
                <p className="text-[10px] text-white/25 mb-1.5 uppercase tracking-wide">Your notes</p>
                <textarea
                  value={driverNote}
                  onChange={(e) => setDriverNote(e.target.value)}
                  placeholder="Add a note about this job…"
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-[#d5a538]/40 resize-none"
                />
                {noteChanged && (
                  <button
                    onClick={saveNote}
                    disabled={savingNote}
                    className="mt-2 w-full py-2 rounded-lg text-xs font-semibold text-[#d5a538] border border-[#d5a538]/30 bg-[#d5a538]/8 disabled:opacity-50"
                  >
                    {noteSaved ? '✓ Saved' : savingNote ? 'Saving…' : 'Save note'}
                  </button>
                )}
              </div>
            )}

            {isDone && booking.driver_notes && (
              <div>
                <p className="text-[10px] text-white/25 mb-1 uppercase tracking-wide">Your notes</p>
                <p className="text-white/50 text-sm leading-relaxed">{booking.driver_notes}</p>
              </div>
            )}
          </div>
        )}

        {/* Completed banner */}
        {['completed', 'Completed'].includes(booking.status) && (
          <div className="bg-green-500/10 border border-green-500/25 rounded-2xl p-5 text-center">
            <CheckCircle2 size={28} className="mx-auto mb-2 text-green-400" />
            <p className="text-green-400 font-semibold">Job Completed</p>
            {booking.quoted_price && (
              <p className="text-green-400/60 text-xs mt-1">£{booking.quoted_price.toFixed(2)}</p>
            )}
          </div>
        )}

        {/* Primary action */}
        {nextStep && (
          <SwipeToConfirm
            label={nextStep.label}
            onConfirm={() => handleStatusUpdate(nextStep.to)}
            loading={updating}
          />
        )}

        {/* Status update error */}
        {updateError && (
          <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">
            <p className="text-red-400 text-sm">{updateError}</p>
          </div>
        )}

        {/* Dispatch + SOS */}
        <div className={`grid gap-3 ${!isDone ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <a
            href={`tel:${OPS_PHONE}`}
            className="py-3 rounded-xl font-semibold text-[#d5a538] text-sm flex items-center justify-center gap-2 border border-[#d5a538]/25 bg-[#d5a538]/8 active:opacity-70"
          >
            <Phone size={14} /> Call Dispatch
          </a>
          {!isDone && (
            <a
              href="tel:999"
              className="py-3 rounded-xl font-semibold text-red-400 text-sm flex items-center justify-center gap-2 bg-red-500/10 border border-red-500/20 active:opacity-70"
            >
              <AlertOctagon size={14} /> SOS 999
            </a>
          )}
        </div>

      </div>
    </div>
  )
}
