'use client'

import { useState, use, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Phone, MessageSquare, Navigation2, User, FileText, CheckCircle2,
  AlertOctagon, ChevronRight, Loader2, Users, Luggage, PlaneLanding, CreditCard,
  UserX, X, Plus, Car, MapPin, RefreshCw, Camera, Trash2, ArrowLeftRight, Banknote, Clock,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BookingStatusBadge } from '@/components/badges'
import { PickupIcon, DropoffIcon } from '@/components/route-icons'
import { JobMap } from '@/components/job-map'
import { formatDate, formatTime, paymentInfo } from '@/lib/format'
import { OPS_PHONE } from '@/lib/config'
import type { Booking, BookingStatus } from '@/lib/types'

// ─── Status flow ─────────────────────────────────────────────────────────────

type StatusStep = { from: BookingStatus; to: BookingStatus; label: string }

const STATUS_FLOW: StatusStep[] = [
  { from: 'accepted',           to: 'En Route', label: 'Head to Pickup' },
  { from: 'confirmed',          to: 'En Route', label: 'Head to Pickup' },
  { from: 'Dispatched',         to: 'En Route', label: 'Head to Pickup' },
  { from: 'En Route',           to: 'Arrived',  label: 'Arrived at Pickup' },
  { from: 'en_route',           to: 'Arrived',  label: 'Arrived at Pickup' },
  { from: 'Arrived',            to: 'Passenger On Board', label: 'Passenger On Board' },
  { from: 'arrived',            to: 'Passenger On Board', label: 'Passenger On Board' },
  { from: 'Passenger On Board', to: 'Completed', label: 'Complete Journey' },
  { from: 'active',             to: 'Completed', label: 'Complete Journey' },
  { from: 'Active',             to: 'Completed', label: 'Complete Journey' },
]

// Timestamp column to stamp when entering each status
const TIMESTAMP_FIELD: Partial<Record<string, string>> = {
  'En Route':           'tracking_started_at',
  'Arrived':            'arrived_at',
  'Passenger On Board': 'passenger_onboard_at',
  'Completed':          'completed_at',
}

const PROGRESS_STEPS: BookingStatus[] = ['En Route', 'Arrived', 'Passenger On Board', 'Completed']
const STEP_LABELS: Record<string, string> = {
  'En Route':           'En Route',
  'Arrived':            'Arrived',
  'Passenger On Board': 'On Board',
  'Completed':          'Done',
}

// ─── Wait grace period ────────────────────────────────────────────────────────

function getGraceMinutes(journeyType: string | null, flightNumber: string | null, override: number | null): number {
  if (override != null) return override
  if (flightNumber || (journeyType ?? '').toLowerCase().includes('airport')) return 60
  if ((journeyType ?? '').toLowerCase().includes('hotel')) return 30
  if ((journeyType ?? '').toLowerCase().includes('station') || (journeyType ?? '').toLowerCase().includes('train')) return 20
  return 15
}

// ─── Passenger preferences ────────────────────────────────────────────────────

const PREF_LABELS: Record<string, string> = {
  quiet_ride:          'Quiet ride',
  no_music:            'No music',
  music_on:            'Music on',
  cool_temperature:    'Cool A/C',
  warm_temperature:    'Warm',
  water_provided:      'Water',
  help_with_luggage:   'Luggage help',
  wheelchair:          'Wheelchair',
  child_seat:          'Child seat',
  meet_and_greet:      'Meet & greet',
  name_board:          'Name board',
}

function formatPref(pref: string): string {
  return PREF_LABELS[pref] ?? pref.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ─── Expense types ────────────────────────────────────────────────────────────

type ExpenseKey = 'parking' | 'ulez' | 'congestion' | 'toll' | 'airport_fee' | 'other'

const EXPENSE_DEFS: { key: ExpenseKey; label: string }[] = [
  { key: 'parking',     label: 'Parking' },
  { key: 'ulez',        label: 'ULEZ' },
  { key: 'congestion',  label: 'Congestion' },
  { key: 'toll',        label: 'Toll' },
  { key: 'airport_fee', label: 'Airport Fee' },
  { key: 'other',       label: 'Other' },
]

interface ExpenseEntry { type: ExpenseKey; label: string; amount: number }

// ─── SwipeToConfirm ───────────────────────────────────────────────────────────

function SwipeToConfirm({
  label,
  onConfirm,
  loading,
  variant = 'gold',
}: {
  label: string
  onConfirm: () => void
  loading: boolean
  variant?: 'gold' | 'green'
}) {
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startXRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const THUMB = 56

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
    if (dragX >= maxDrag() * 0.80) {
      setDragX(maxDrag())
      onConfirm()
    } else {
      setDragX(0)
    }
  }

  useEffect(() => { if (!loading) setDragX(0) }, [loading])

  const progress = maxDrag() > 0 ? dragX / maxDrag() : 0
  const rgb = variant === 'green' ? '16,185,129' : '213,165,56'
  const thumbBg = variant === 'green'
    ? 'linear-gradient(135deg, #34d399, #10b981 55%, #059669)'
    : 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)'

  return (
    <div
      ref={containerRef}
      className="relative w-full h-16 rounded-2xl select-none overflow-hidden"
      style={{ background: `rgba(${rgb},0.10)`, border: `1px solid rgba(${rgb},0.25)` }}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-2xl"
        style={{
          width: `${Math.min(100, (dragX + THUMB + 4) / (containerRef.current?.offsetWidth ?? 320) * 100)}%`,
          background: `linear-gradient(90deg,rgba(${rgb},0.22) 0%,rgba(${rgb},${0.06 + progress * 0.16}) 100%)`,
          transition: dragging ? 'none' : 'width 0.2s ease',
        }}
      />
      <div className="absolute inset-0 flex items-center justify-end pr-4 pointer-events-none gap-0.5">
        {[0.55, 0.30, 0.12].map((op, i) => (
          <ChevronRight key={i} size={13} style={{ color: `rgba(${rgb},${op * (1 - progress * 0.9)})` }} />
        ))}
      </div>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none pl-16">
        <span className="text-sm font-bold" style={{ color: `rgba(255,255,255,${0.45 + progress * 0.4})` }}>
          {label}
        </span>
      </div>
      <div
        className="absolute top-2 rounded-xl flex items-center justify-center touch-none cursor-grab active:cursor-grabbing"
        style={{
          left: `${dragX + 4}px`,
          width: THUMB,
          bottom: 8,
          background: loading ? `rgba(${rgb},0.45)` : thumbBg,
          transition: dragging ? 'none' : 'left 0.2s ease',
          boxShadow: `0 2px 10px rgba(${rgb},0.35)`,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {loading
          ? <Loader2 size={18} className="animate-spin text-[#020813]" />
          : <ChevronRight size={22} className="text-[#020813]" strokeWidth={2.5} />
        }
      </div>
    </div>
  )
}

// ─── Wait timer ───────────────────────────────────────────────────────────────

function WaitTimer({ since, graceMinutes }: { since: string | null; graceMinutes: number }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!since) return
    const update = () => setElapsed(Math.floor((Date.now() - new Date(since).getTime()) / 1000))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [since])

  const elapsedMin = Math.floor(elapsed / 60)
  const elapsedSec = elapsed % 60
  const graceRemaining = graceMinutes * 60 - elapsed
  const overtime = graceRemaining < 0
  const overMinutes = Math.floor(Math.abs(graceRemaining) / 60)
  const overSeconds = Math.abs(graceRemaining) % 60

  return (
    <div className="flex items-center gap-3">
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">Waiting</p>
        <span className="text-[#d5a538] font-mono font-bold text-sm">
          {String(elapsedMin).padStart(2, '0')}:{String(elapsedSec).padStart(2, '0')}
        </span>
      </div>
      <div className="w-px h-7 bg-gray-200" />
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">
          {overtime ? 'Overtime' : 'Free wait'}
        </p>
        <span
          className="font-mono font-bold text-sm"
          style={{ color: overtime ? '#f87171' : 'rgba(255,255,255,0.5)' }}
        >
          {overtime ? '+' : ''}{String(overMinutes).padStart(2, '0')}:{String(overSeconds).padStart(2, '0')}
        </span>
      </div>
    </div>
  )
}

// ─── Expense modal ────────────────────────────────────────────────────────────

function ExpenseModal({
  onConfirm,
  onSkip,
  loading,
}: {
  onConfirm: (expenses: ExpenseEntry[]) => void
  onSkip: () => void
  loading: boolean
}) {
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([])
  const [activeKey, setActiveKey] = useState<ExpenseKey | null>(null)
  const [inputValue, setInputValue] = useState('')

  const total = expenses.reduce((s, e) => s + e.amount, 0)

  const addExpense = () => {
    if (!activeKey) return
    const amount = parseFloat(inputValue)
    if (isNaN(amount) || amount <= 0) return
    const def = EXPENSE_DEFS.find(d => d.key === activeKey)!
    setExpenses(prev => [...prev, { type: activeKey, label: def.label, amount }])
    setInputValue('')
    setActiveKey(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ background: 'rgba(2,8,19,0.85)' }}>
      <div className="bg-white rounded-t-3xl px-5 pt-5 pb-10 max-h-[90vh] overflow-y-auto">
        <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-5" />
        <h2 className="text-gray-900 font-bold text-lg mb-1">Log Journey Expenses</h2>
        <p className="text-white/35 text-xs mb-5">Optional — record any out-of-pocket costs</p>

        {/* Type buttons */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {EXPENSE_DEFS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setActiveKey(activeKey === key ? null : key); setInputValue('') }}
              className="py-2.5 px-2 rounded-xl text-xs font-semibold transition-all active:opacity-70"
              style={
                activeKey === key
                  ? { background: 'rgba(213,165,56,0.2)', border: '1px solid rgba(213,165,56,0.5)', color: '#d5a538' }
                  : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }
              }
            >
              {label}
            </button>
          ))}
        </div>

        {/* Amount input */}
        {activeKey && (
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-sm">£</span>
              <input
                type="number"
                min="0"
                step="0.50"
                placeholder="0.00"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addExpense()}
                autoFocus
                className="w-full bg-gray-100 border border-gray-300 rounded-xl pl-7 pr-3 py-3 text-gray-900 text-sm font-semibold focus:outline-none focus:border-[#d5a538]/50"
              />
            </div>
            <button
              onClick={addExpense}
              className="px-4 py-3 rounded-xl font-semibold text-[#020813] text-sm flex items-center gap-1.5"
              style={{ background: 'linear-gradient(135deg, #f1c56a, #d5a538)' }}
            >
              <Plus size={14} /> Add
            </button>
          </div>
        )}

        {/* Expense list */}
        {expenses.length > 0 && (
          <div className="space-y-2 mb-5">
            {expenses.map((exp, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-100 rounded-xl px-3 py-2.5">
                <span className="text-gray-600 text-sm">{exp.label}</span>
                <div className="flex items-center gap-3">
                  <span className="text-gray-900 font-semibold text-sm">£{exp.amount.toFixed(2)}</span>
                  <button onClick={() => setExpenses(prev => prev.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-400 active:opacity-70 transition-colors">
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 pt-1 border-t border-gray-200">
              <span className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Total</span>
              <span className="text-[#d5a538] font-bold text-base">£{total.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onSkip}
            disabled={loading}
            className="flex-1 py-3.5 rounded-xl text-sm font-semibold text-gray-400 border border-gray-200 bg-gray-100 active:opacity-70 disabled:opacity-40"
          >
            Skip
          </button>
          <button
            onClick={() => onConfirm(expenses)}
            disabled={loading}
            className="px-5 py-3.5 rounded-xl text-sm font-bold text-[#020813] flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ flex: 2, background: 'linear-gradient(135deg, #34d399, #10b981 55%, #059669)' }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {loading ? 'Completing…' : 'Confirm & Complete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Flight widget ────────────────────────────────────────────────────────────

interface FlightData {
  status: 'Scheduled' | 'En Route' | 'Landed' | 'Cancelled' | 'Diverted' | 'Unknown'
  origin: string | null
  destination: string | null
  scheduled_arrival: string | null
  estimated_arrival: string | null
  actual_arrival: string | null
  gate: string | null
  baggage_claim: string | null
  delay_minutes: number | null
  tail_number: string | null
  aircraft_type: string | null
}

const STATUS_COLOR: Record<string, string> = {
  Landed:    '#10b981',
  'En Route': '#3b82f6',
  Delayed:   '#f59e0b',
  Cancelled: '#ef4444',
  Diverted:  '#f97316',
  Scheduled: 'rgba(255,255,255,0.45)',
  Unknown:   'rgba(255,255,255,0.35)',
}

function formatArrival(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London', hour12: false,
  })
}

function FlightWidget({
  bookingId,
  flightNumber,
  airport,
  activelyMonitoring,
}: {
  bookingId: string
  flightNumber: string
  airport: string | null
  activelyMonitoring: boolean
}) {
  const supabase = createClient()
  const [flight, setFlight] = useState<FlightData | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchFlight = useCallback(async (manual = false) => {
    if (refreshing && !manual) return
    setRefreshing(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/track-flight`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ bookingId }),
      })
      const json = await res.json()
      if (json.ok && json.data) {
        setFlight(json.data)
        setLastChecked(new Date())
      } else if (json.error) {
        setError(json.error)
      }
    } catch {
      setError('Could not reach flight tracker')
    }
    setRefreshing(false)
  }, [bookingId, supabase, refreshing])

  useEffect(() => {
    fetchFlight()
    // Poll every 60 seconds when actively monitoring (Arrived stage)
    if (!activelyMonitoring) return
    const id = setInterval(() => fetchFlight(), 60_000)
    return () => clearInterval(id)
  }, [activelyMonitoring]) // eslint-disable-line react-hooks/exhaustive-deps

  const statusColor = flight ? (STATUS_COLOR[flight.status] ?? STATUS_COLOR.Unknown) : 'rgba(255,255,255,0.35)'
  const displayFlight = flightNumber.replace(/\s+/g, '').toUpperCase()

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
            <PlaneLanding size={18} className="text-blue-400" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">Flight</p>
            <p className="text-gray-900 font-bold text-base tracking-wide">{displayFlight}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {flight && (
            <span
              className="text-[10px] font-bold px-2 py-1 rounded-full"
              style={{ color: statusColor, background: `${statusColor}18`, border: `1px solid ${statusColor}40` }}
            >
              {flight.status}
            </span>
          )}
          <button
            onClick={() => fetchFlight(true)}
            disabled={refreshing}
            className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center active:opacity-70 disabled:opacity-40"
          >
            <RefreshCw size={13} className={`text-gray-400 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && !flight && (
        <p className="text-gray-400 text-xs">{error}</p>
      )}

      {flight && (
        <div className="space-y-2.5">
          {/* Arrival times */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">Scheduled</p>
              <p className="text-gray-600 text-sm font-semibold">{formatArrival(flight.scheduled_arrival)}</p>
            </div>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">Estimated</p>
              <p
                className="text-sm font-semibold"
                style={{ color: (flight.delay_minutes ?? 0) > 0 ? '#f59e0b' : 'rgba(255,255,255,0.7)' }}
              >
                {formatArrival(flight.estimated_arrival ?? flight.scheduled_arrival)}
                {(flight.delay_minutes ?? 0) > 0 && (
                  <span className="text-[10px] ml-1 text-amber-400">+{flight.delay_minutes}m</span>
                )}
              </p>
            </div>
            {flight.actual_arrival && (
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">Landed</p>
                <p className="text-sm font-bold" style={{ color: '#10b981' }}>{formatArrival(flight.actual_arrival)}</p>
              </div>
            )}
          </div>

          {/* Gate / Baggage */}
          {(flight.gate || flight.baggage_claim) && (
            <div className="flex items-center gap-3 pt-2.5 border-t border-gray-100">
              {flight.gate && (
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">Gate</p>
                  <p className="text-gray-700 text-sm font-bold">{flight.gate}</p>
                </div>
              )}
              {flight.gate && flight.baggage_claim && <div className="w-px h-6 bg-gray-200" />}
              {flight.baggage_claim && (
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">Baggage</p>
                  <p className="text-gray-700 text-sm font-bold">{flight.baggage_claim}</p>
                </div>
              )}
            </div>
          )}

          {/* Route */}
          {(flight.origin || flight.destination) && (
            <div className="flex items-center gap-2 pt-2.5 border-t border-gray-100">
              <span className="text-gray-400 text-xs font-mono">{flight.origin ?? '?'}</span>
              <div className="flex-1 h-px bg-gray-100" />
              <PlaneLanding size={10} className="text-blue-400/60" />
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-gray-400 text-xs font-mono">{flight.destination ?? '?'}</span>
            </div>
          )}
        </div>
      )}

      {/* Last checked */}
      {lastChecked && (
        <p className="text-[9px] text-gray-300 mt-3">
          Updated {lastChecked.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          {activelyMonitoring && ' · auto-refreshes every 60s'}
        </p>
      )}

      {/* Fallback flightradar link */}
      <a
        href={`https://www.flightradar24.com/${displayFlight}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 mt-2 text-[10px] text-blue-400/50 hover:text-blue-400/80"
      >
        <ChevronRight size={10} /> View on Flightradar24
      </a>
    </div>
  )
}

// ─── Navigation helper ────────────────────────────────────────────────────────

function openMaps(destination: string, from?: string) {
  const dest = encodeURIComponent(destination)
  const url = from
    ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${dest}&travelmode=driving`
    : `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`
  window.open(url, '_blank')
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [noShowConfirm, setNoShowConfirm] = useState(false)
  const [driverNote, setDriverNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [noteSaved, setNoteSaved] = useState(false)

  // 5-second undo buffer after "Passenger On Board"
  const [pobUndoActive, setPobUndoActive] = useState(false)
  const [pobCountdown, setPobCountdown] = useState(5)
  const pobTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pobIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Expense modal shown before completing journey
  const [showExpenseModal, setShowExpenseModal] = useState(false)

  // Payment method selection
  const [localPaymentMethod, setLocalPaymentMethod] = useState<'Cash' | 'Card' | 'Bank Transfer' | 'TBC' | null>(null)
  const [cashReceived, setCashReceived] = useState('')
  const [savingPayment, setSavingPayment] = useState(false)

  // Photo / damage reports
  interface BookingPhoto { id: string; url: string; caption: string | null; created_at: string }
  const [photos, setPhotos] = useState<BookingPhoto[]>([])
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const loadBooking = useCallback(async () => {
    const [bookingRes, photosRes] = await Promise.all([
      supabase.from('bookings').select('*').eq('id', id).single(),
      supabase.from('booking_photos').select('id, url, caption, created_at').eq('booking_id', id).order('created_at', { ascending: true }),
    ])
    if (bookingRes.data) {
      setBooking(bookingRes.data as Booking)
      setDriverNote(bookingRes.data.driver_notes ?? '')
    }
    if (photosRes.data) setPhotos(photosRes.data)
    setLoading(false)
  }, [id, supabase])

  useEffect(() => { loadBooking() }, [loadBooking])

  useEffect(() => {
    const channel = supabase
      .channel(`booking-${id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'bookings', filter: `id=eq.${id}`,
      }, (payload) => { setBooking(payload.new as Booking) })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id, supabase])

  useEffect(() => () => {
    if (pobTimerRef.current) clearTimeout(pobTimerRef.current)
    if (pobIntervalRef.current) clearInterval(pobIntervalRef.current)
  }, [])

  // ── GPS tracking (En Route + Arrived) ────────────────────────────────────────
  const gpsWatchRef = useRef<number | null>(null)
  const gpsLastPushRef = useRef<number>(0)

  useEffect(() => {
    const statusNeedsGps = booking && ['En Route', 'en_route', 'Arrived', 'arrived'].includes(booking.status)
    const driverId = booking?.assigned_driver_id

    if (!statusNeedsGps || !driverId || typeof navigator === 'undefined' || !navigator.geolocation) {
      if (gpsWatchRef.current != null) {
        navigator.geolocation.clearWatch(gpsWatchRef.current)
        gpsWatchRef.current = null
      }
      return
    }

    if (gpsWatchRef.current != null) return // already watching

    gpsWatchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const now = Date.now()
        if (now - gpsLastPushRef.current < 30_000) return
        gpsLastPushRef.current = now
        await supabase.from('drivers').update({
          current_lat: pos.coords.latitude,
          current_lng: pos.coords.longitude,
          location_updated_at: new Date().toISOString(),
        }).eq('id', driverId)
      },
      (err) => console.warn('[GPS]', err.message),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 10_000 },
    )

    return () => {
      if (gpsWatchRef.current != null) {
        navigator.geolocation.clearWatch(gpsWatchRef.current)
        gpsWatchRef.current = null
      }
    }
  }, [booking?.status, booking?.assigned_driver_id, supabase])

  const fireCustomerNotification = (bookingId: string, status: string) => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      fetch('https://evexec.co.uk/api/booking/notify-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ bookingId, status }),
      }).catch(() => {})
    })
  }

  const fireArrivedSms = (bookingId: string) => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notify-passenger-arrived`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ bookingId }),
      }).catch(() => {})
    })
  }

  const triggerReceiptEmail = (bookingId: string) => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-journey-receipt`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ bookingId }),
      }).catch(() => {})
    })
  }

  const handleStatusUpdate = async (nextStatus: BookingStatus, triggerUndo = true) => {
    if (!booking || updating) return
    setUpdating(true)
    setUpdateError(null)
    setPobUndoActive(false)
    if (pobTimerRef.current) clearTimeout(pobTimerRef.current)
    if (pobIntervalRef.current) clearInterval(pobIntervalRef.current)

    const tsField = TIMESTAMP_FIELD[nextStatus]
    const now = new Date().toISOString()
    const patch: Record<string, string> = { status: nextStatus, updated_at: now }
    if (tsField) patch[tsField] = now

    const { error } = await supabase.from('bookings').update(patch).eq('id', booking.id)

    if (error) {
      setUpdateError(error.message ?? 'Failed to update. Please try again.')
    } else {
      const updated = { ...booking, status: nextStatus, ...(tsField ? { [tsField]: now } : {}) } as Booking
      setBooking(updated)
      fireCustomerNotification(booking.id, nextStatus)
      if (nextStatus === 'Arrived') fireArrivedSms(booking.id)

      if (nextStatus === 'Passenger On Board' && triggerUndo) {
        setPobCountdown(5)
        setPobUndoActive(true)
        pobIntervalRef.current = setInterval(() => {
          setPobCountdown(c => {
            if (c <= 1) { clearInterval(pobIntervalRef.current!); return 0 }
            return c - 1
          })
        }, 1000)
        pobTimerRef.current = setTimeout(() => { setPobUndoActive(false) }, 5000)
      }
    }
    setUpdating(false)
  }

  const handleUndoPob = async () => {
    if (pobTimerRef.current) clearTimeout(pobTimerRef.current)
    if (pobIntervalRef.current) clearInterval(pobIntervalRef.current)
    setPobUndoActive(false)
    await handleStatusUpdate('Arrived', false)
  }

  const handleCompleteWithExpenses = async (expenses: ExpenseEntry[]) => {
    if (!booking) return
    setShowExpenseModal(false)
    setUpdating(true)
    setUpdateError(null)

    if (expenses.length > 0) {
      await supabase.from('booking_expenses').insert(
        expenses.map(e => ({ booking_id: booking.id, type: e.type, amount: e.amount }))
      )
    }

    const now = new Date().toISOString()
    const { error } = await supabase.from('bookings').update({
      status: 'Completed', completed_at: now, updated_at: now,
    }).eq('id', booking.id)

    if (error) {
      setUpdateError(error.message ?? 'Failed to complete. Please try again.')
    } else {
      setBooking({ ...booking, status: 'Completed', completed_at: now })
      fireCustomerNotification(booking.id, 'Completed')
      // Fire-and-forget receipt emails
      triggerReceiptEmail(booking.id)
    }
    setUpdating(false)
  }

  const handleNoShow = async () => {
    if (!booking || updating) return
    setUpdating(true)
    setUpdateError(null)
    setNoShowConfirm(false)
    const noShowNote = [driverNote.trim(), '[No Show] Passenger was not at the pickup location.']
      .filter(Boolean).join('\n\n')
    const { error } = await supabase.from('bookings').update({
      status: 'Cancelled', driver_notes: noShowNote, updated_at: new Date().toISOString(),
    }).eq('id', booking.id)
    if (error) {
      setUpdateError(error.message ?? 'Failed to mark no show. Please try again.')
    } else {
      setBooking({ ...booking, status: 'Cancelled', driver_notes: noShowNote })
      setDriverNote(noShowNote)
      fireCustomerNotification(booking.id, 'No Show')
    }
    setUpdating(false)
  }

  const uploadPhoto = async (file: File) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !booking || uploadingPhoto) return
    setUploadingPhoto(true)
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${user.id}/${booking.id}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage.from('job-photos').upload(path, file, { upsert: false })
    if (!upErr) {
      const { data: urlData } = supabase.storage.from('job-photos').getPublicUrl(path)
      const { data: row } = await supabase.from('booking_photos')
        .insert({ booking_id: booking.id, driver_id: user.id, url: urlData.publicUrl })
        .select('id, url, caption, created_at').single()
      if (row) setPhotos(prev => [...prev, row])
    }
    setUploadingPhoto(false)
  }

  const deletePhoto = async (photoId: string, url: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const path = url.split('/job-photos/')[1]
    if (path) await supabase.storage.from('job-photos').remove([path])
    await supabase.from('booking_photos').delete().eq('id', photoId)
    setPhotos(prev => prev.filter(p => p.id !== photoId))
  }

  const handleSetPaymentMethod = async (method: 'Cash' | 'Card' | 'Bank Transfer' | 'TBC') => {
    if (!booking) return
    setLocalPaymentMethod(method)
    setSavingPayment(true)
    const patch: Record<string, string> = { payment_method: method }
    if (method === 'Card' || method === 'Bank Transfer') patch.payment_status = 'paid'
    await supabase.from('bookings').update(patch).eq('id', booking.id)
    setBooking(prev => prev ? {
      ...prev,
      payment_method: method,
      ...((method === 'Card' || method === 'Bank Transfer') ? { payment_status: 'paid' } : {}),
    } : prev)
    setSavingPayment(false)
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
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#d5a538] border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <p className="text-gray-400">Booking not found</p>
      </div>
    )
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const nextStep = STATUS_FLOW.find(s => s.from === booking.status)
  const isDone = ['completed', 'Completed', 'cancelled', 'Cancelled', 'rejected'].includes(booking.status)
  const isNoShow = booking.status === 'Cancelled' && (booking.driver_notes ?? '').includes('[No Show]')
  const isEnRoute = ['En Route', 'en_route'].includes(booking.status)
  const isArrived = ['Arrived', 'arrived'].includes(booking.status)
  const isPob = booking.status === 'Passenger On Board'
  const isActive = isPob || ['active', 'Active'].includes(booking.status)
  const isCompleted = ['completed', 'Completed'].includes(booking.status)

  const progressIndex = PROGRESS_STEPS.findIndex(s => s === booking.status)
  const showProgress = progressIndex >= 0 || isCompleted
  const currentPaymentMethod = (localPaymentMethod ?? booking.payment_method) as 'Cash' | 'Card' | 'Bank Transfer' | 'TBC' | null
  const cashReceivedValid = currentPaymentMethod !== 'Cash' || (parseFloat(cashReceived) > 0)
  const canCompleteJourney = cashReceivedValid

  // Only allow initial dispatch transitions within 24 h of pickup;
  // mid-job statuses (En Route and beyond) are always unlocked.
  const jobDateTime = booking.travel_date
    ? new Date(`${booking.travel_date}T${booking.travel_time ?? '00:00:00'}`)
    : null
  const withinSwipeWindow =
    isEnRoute || isArrived || isPob || isActive ||
    !jobDateTime ||
    (jobDateTime.getTime() - Date.now()) / 3_600_000 <= 24

  const pickupAddress = booking.pickup_location ?? booking.airport ?? '—'
  const dropoffAddress = booking.dropoff_address ?? booking.airport ?? '—'
  const bookingRef = booking.ref ?? booking.id.slice(0, 8).toUpperCase()
  const noteChanged = driverNote !== (booking.driver_notes ?? '')
  const showNotes = booking.operator_note || !isDone || (isDone && booking.driver_notes)
  const showNoShow = (isEnRoute || isArrived) && !isDone
  const graceMinutes = getGraceMinutes(booking.journey_type, booking.flight_number, booking.wait_time_minutes)
  const prefs = booking.passenger_preferences ?? []

  return (
    <>
      <div className="min-h-screen bg-[#f8fafc] pb-8">

        {/* Header */}
        <div className="px-4 pt-12 pb-4 flex items-center gap-3 border-b border-gray-100">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center active:opacity-70"
          >
            <ArrowLeft size={18} className="text-gray-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-gray-900 font-semibold text-base">{bookingRef}</h1>
            <div className="mt-0.5"><BookingStatusBadge status={booking.status} /></div>
          </div>
        </div>

        <div className="px-4 pt-4 space-y-3">

          {/* ── Journey action card ──────────────────────────────────────── */}
          {(nextStep || isCompleted || isNoShow) && (
            <div
              className="rounded-2xl p-4 space-y-4"
              style={{
                background: isCompleted ? 'rgba(16,185,129,0.06)' : 'rgba(213,165,56,0.04)',
                border: isCompleted ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(213,165,56,0.15)',
              }}
            >
              {/* Stage context */}
              {(isEnRoute || isArrived || isPob) && (
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(213,165,56,0.12)', border: '1px solid rgba(213,165,56,0.2)' }}
                  >
                    {isEnRoute && <Navigation2 size={18} className="text-[#d5a538]" />}
                    {isArrived  && <MapPin size={18} className="text-[#d5a538]" />}
                    {isPob      && <Car size={18} className="text-[#d5a538]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    {isEnRoute && (
                      <>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">En Route to Pickup</p>
                        <p className="text-gray-900 text-sm font-medium leading-snug truncate">{pickupAddress}</p>
                      </>
                    )}
                    {isArrived && (
                      <>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Arrived — Waiting</p>
                        <WaitTimer since={booking.arrived_at} graceMinutes={graceMinutes} />
                      </>
                    )}
                    {isPob && (
                      <>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">Passenger On Board</p>
                        <p className="text-gray-900 text-sm font-medium leading-snug truncate">{dropoffAddress}</p>
                      </>
                    )}
                  </div>
                  {(isEnRoute || isPob) && (
                    <button
                      onClick={() => openMaps(isActive ? dropoffAddress : pickupAddress)}
                      className="flex items-center gap-1.5 text-[#d5a538] text-xs font-semibold flex-shrink-0 bg-[#d5a538]/10 px-3 py-2 rounded-xl active:opacity-70"
                    >
                      <Navigation2 size={12} /> Go
                    </button>
                  )}
                </div>
              )}

              {/* Completed */}
              {isCompleted && (
                <div className="text-center py-2">
                  <CheckCircle2 size={32} className="mx-auto mb-2 text-green-400" />
                  <p className="text-green-400 font-bold text-lg">Journey Complete</p>
                  {booking.quoted_price != null && booking.quoted_price > 0 && (
                    <p className="text-green-400/60 text-sm mt-1">£{booking.quoted_price.toFixed(2)}</p>
                  )}
                  <Link href={`/jobs/${booking.id}/receipt`} className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 rounded-xl bg-gray-100 border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-100 transition-colors">
                    <FileText size={14} />
                    View Receipt
                  </Link>
                </div>
              )}

              {/* No Show */}
              {isNoShow && !isCompleted && (
                <div className="text-center py-2">
                  <UserX size={32} className="mx-auto mb-2 text-amber-400" />
                  <p className="text-amber-400 font-bold">Passenger No Show</p>
                </div>
              )}

              {/* 5-second undo after POB */}
              {pobUndoActive && (
                <div className="flex items-center justify-between bg-[#d5a538]/10 border border-[#d5a538]/25 rounded-xl px-4 py-3">
                  <span className="text-gray-500 text-sm">Passenger On Board set</span>
                  <button
                    onClick={handleUndoPob}
                    className="text-[#d5a538] text-sm font-bold flex items-center gap-2"
                  >
                    Undo
                    <span className="w-6 h-6 rounded-full border-2 border-[#d5a538]/60 flex items-center justify-center text-[11px] font-bold text-[#d5a538]">
                      {pobCountdown}
                    </span>
                  </button>
                </div>
              )}

              {/* Swipe action */}
              {nextStep && !pobUndoActive && (
                <>
                  {withinSwipeWindow ? (
                    <SwipeToConfirm
                      label={nextStep.label}
                      onConfirm={() => {
                        if (nextStep.to === 'Completed') {
                          if (!canCompleteJourney) return
                          setShowExpenseModal(true)
                        } else {
                          handleStatusUpdate(nextStep.to)
                        }
                      }}
                      loading={updating}
                      variant={nextStep.to === 'Completed' ? 'green' : 'gold'}
                    />
                  ) : (
                    <div className="w-full h-16 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center gap-2">
                      <Clock size={14} className="text-gray-400" />
                      <span className="text-gray-400 text-sm font-semibold">Available 24 h before pickup</span>
                    </div>
                  )}
                  {nextStep.to === 'Completed' && !canCompleteJourney && (
                    <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5 mt-2">
                      <Banknote size={14} className="text-amber-400 flex-shrink-0" />
                      <p className="text-amber-400 text-xs font-semibold">Enter cash received above before completing</p>
                    </div>
                  )}
                </>
              )}

              {/* No Show */}
              {showNoShow && !pobUndoActive && (
                noShowConfirm ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setNoShowConfirm(false)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-400 border border-gray-200 bg-gray-100 active:opacity-70"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleNoShow}
                      disabled={updating}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-amber-400 border border-amber-500/30 bg-amber-500/10 active:opacity-70 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <UserX size={14} /> Confirm No Show
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setNoShowConfirm(true)}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold text-amber-400/70 border border-amber-500/20 bg-amber-500/5 active:opacity-70 flex items-center justify-center gap-2"
                  >
                    <UserX size={14} /> Passenger No Show
                  </button>
                )
              )}
            </div>
          )}

          {/* ── Progress stepper ─────────────────────────────────────────── */}
          {showProgress && (
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3.5">
              <div className="relative flex items-start justify-between">
                <div
                  className="absolute"
                  style={{ top: 12, left: '12.5%', right: '12.5%', height: 1, background: 'rgba(255,255,255,0.06)' }}
                />
                {PROGRESS_STEPS.map((step, i) => {
                  const done = i < progressIndex || isCompleted
                  const current = i === progressIndex && !isCompleted
                  return (
                    <div key={step} className="flex flex-col items-center gap-1.5 relative z-10" style={{ flex: 1 }}>
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                        style={{
                          background: done
                            ? 'linear-gradient(135deg,#f1c56a,#d5a538)'
                            : current
                              ? 'rgba(213,165,56,0.18)'
                              : 'rgba(0,0,0,0.06)',
                          border: current ? '1.5px solid rgba(213,165,56,0.6)' : 'none',
                          color: done ? '#020813' : current ? '#d5a538' : 'rgba(0,0,0,0.25)',
                        }}
                      >
                        {done ? '✓' : i + 1}
                      </div>
                      <span className="text-[9px] text-gray-400 text-center leading-tight" style={{ maxWidth: 52 }}>
                        {STEP_LABELS[step]}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Error ────────────────────────────────────────────────────── */}
          {updateError && (
            <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">
              <p className="text-red-400 text-sm">{updateError}</p>
            </div>
          )}

          {/* ── Passenger ────────────────────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Passenger</p>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <User size={18} className="text-white/35" />
                </div>
                <div>
                  <p className="text-gray-900 font-semibold text-sm">{booking.customer_name}</p>
                  {booking.customer_email && (
                    <p className="text-gray-400 text-xs mt-0.5 truncate max-w-[180px]">{booking.customer_email}</p>
                  )}
                </div>
              </div>
              {booking.customer_phone && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <a
                    href={`sms:${booking.customer_phone}`}
                    className="w-10 h-10 rounded-xl flex items-center justify-center border border-gray-200 bg-gray-100 active:opacity-70"
                  >
                    <MessageSquare size={16} className="text-gray-500" />
                  </a>
                  <a
                    href={`tel:${booking.customer_phone}`}
                    className="w-10 h-10 rounded-xl flex items-center justify-center border border-gray-200 bg-gray-100 active:opacity-70"
                  >
                    <Phone size={16} className="text-[#d5a538]" />
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* ── Passenger preferences ────────────────────────────────────── */}
          {prefs.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2.5">Passenger Preferences</p>
              <div className="flex flex-wrap gap-2">
                {prefs.map((pref) => (
                  <span
                    key={pref}
                    className="text-xs font-medium px-2.5 py-1 rounded-full"
                    style={{ background: 'rgba(213,165,56,0.1)', color: 'rgba(213,165,56,0.85)', border: '1px solid rgba(213,165,56,0.2)' }}
                  >
                    {formatPref(pref)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Route ────────────────────────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-4">Route</p>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1 flex-shrink-0 mt-0.5">
                  <PickupIcon booking={booking} size={10} />
                  <div className="w-px h-5 bg-[#d5a538]/20" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-400 text-[10px] uppercase tracking-wider mb-0.5">
                    Pickup
                    {booking.travel_time ? ` · ${formatTime(booking.travel_time)}` : ''}
                    {booking.travel_date ? ` · ${formatDate(booking.travel_date)}` : ''}
                  </p>
                  <p className="text-gray-900 text-sm font-medium leading-snug">{pickupAddress}</p>
                </div>
                <button
                  onClick={() => openMaps(pickupAddress)}
                  className="flex items-center gap-1.5 text-[#d5a538] text-xs font-semibold flex-shrink-0 bg-[#d5a538]/10 px-3 py-2 rounded-xl active:opacity-70"
                >
                  <Navigation2 size={12} /> Go
                </button>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <DropoffIcon size={10} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-400 text-[10px] uppercase tracking-wider mb-0.5">Drop-off</p>
                  <p className="text-gray-900 text-sm font-medium leading-snug">{dropoffAddress}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {isPob && dropoffAddress !== '—' && (
                    <button
                      onClick={() =>
                        window.open(
                          `https://www.google.com/maps/search/EV+charging+station+near+${encodeURIComponent(dropoffAddress)}`,
                          '_blank',
                        )
                      }
                      className="flex items-center gap-1 text-green-400 text-[10px] font-semibold bg-green-400/10 border border-green-400/20 px-2 py-2 rounded-xl active:opacity-70"
                      title="Find EV charger near dropoff"
                    >
                      <Car size={10} />
                      <span>⚡</span>
                    </button>
                  )}
                  <button
                    onClick={() => openMaps(dropoffAddress, pickupAddress)}
                    className="flex items-center gap-1.5 text-[#d5a538] text-xs font-semibold bg-[#d5a538]/10 px-3 py-2 rounded-xl active:opacity-70"
                  >
                    <Navigation2 size={12} /> Go
                  </button>
                </div>
              </div>
              {(booking.passengers > 0 || booking.luggage) && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-3 border-t border-gray-100">
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
                </div>
              )}
            </div>
          </div>

          {/* ── Payment ──────────────────────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-4">Payment</p>

            {booking.quoted_price != null && (
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200">
                <p className="text-gray-400 text-sm">Total</p>
                {booking.quoted_price > 0
                  ? <p className="text-[#d5a538] font-bold text-2xl">£{booking.quoted_price.toFixed(2)}</p>
                  : <p className="text-gray-400 text-sm italic">No payment to collect</p>
                }
              </div>
            )}

            <div className="mb-3">
              <p className="text-gray-400 text-[10px] uppercase tracking-wide mb-2">Payment Method</p>
              <div className="grid grid-cols-2 gap-2">
                {(['Cash', 'Card', 'Bank Transfer', 'TBC'] as const).map((method) => {
                  const active = currentPaymentMethod === method
                  return (
                    <button
                      key={method}
                      onClick={() => handleSetPaymentMethod(method)}
                      disabled={savingPayment}
                      className="py-2.5 rounded-xl text-xs font-bold transition-all active:opacity-70 disabled:opacity-50 flex items-center justify-center gap-1.5"
                      style={
                        active
                          ? (method === 'Card' || method === 'Bank Transfer')
                            ? { background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981' }
                            : method === 'Cash'
                            ? { background: 'rgba(213,165,56,0.15)', border: '1px solid rgba(213,165,56,0.4)', color: '#d5a538' }
                            : { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)' }
                          : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' }
                      }
                    >
                      {method === 'Cash' && <Banknote size={12} />}
                      {method === 'Card' && <CreditCard size={12} />}
                      {method === 'Bank Transfer' && <ArrowLeftRight size={12} />}
                      {method}
                    </button>
                  )
                })}
              </div>
            </div>

            {currentPaymentMethod === 'Cash' && !isDone && (
              <div className="mt-3">
                <p className="text-gray-400 text-[10px] uppercase tracking-wide mb-2">Cash Received</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#d5a538] font-bold text-sm">£</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={cashReceived}
                    onChange={e => setCashReceived(e.target.value)}
                    className="w-full bg-gray-100 border border-[#d5a538]/30 rounded-xl pl-7 pr-3 py-3 text-gray-900 text-sm font-semibold focus:outline-none focus:border-[#d5a538]/60"
                  />
                </div>
                {cashReceived && parseFloat(cashReceived) > 0 && booking.quoted_price != null && (
                  <p className="text-gray-400 text-xs mt-1.5 text-right">
                    Change: £{Math.max(0, parseFloat(cashReceived) - booking.quoted_price).toFixed(2)}
                  </p>
                )}
              </div>
            )}

            {(currentPaymentMethod === 'Card' || currentPaymentMethod === 'Bank Transfer') && (
              <div className="mt-3 flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5">
                <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />
                <p className="text-emerald-400 text-xs font-semibold">
                  {currentPaymentMethod === 'Bank Transfer' ? 'Bank transfer — marked as paid' : 'Marked as paid on operator system'}
                </p>
              </div>
            )}

            {currentPaymentMethod === 'TBC' && (
              <div className="mt-3 flex items-center gap-2 bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5">
                <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 flex-shrink-0" />
                <p className="text-gray-400 text-xs">Payment to be confirmed</p>
              </div>
            )}
          </div>

          {/* ── Flight tracker ────────────────────────────────────────────── */}
          {booking.flight_number && (
            <FlightWidget
              bookingId={booking.id}
              flightNumber={booking.flight_number}
              airport={booking.airport}
              activelyMonitoring={isArrived}
            />
          )}

          {/* ── Map ──────────────────────────────────────────────────────── */}
          {pickupAddress !== '—' && dropoffAddress !== '—' && (
            <JobMap pickup={pickupAddress} dropoff={dropoffAddress} />
          )}

          {/* ── Return journey ─────────────────────────────────────────── */}
          {booking.return_journey && (
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(213,165,56,0.1)', border: '1px solid rgba(213,165,56,0.2)' }}
              >
                <ArrowLeftRight size={15} className="text-[#d5a538]" />
              </div>
              <div>
                <p className="text-gray-700 text-xs font-semibold">Return journey included</p>
                <p className="text-gray-400 text-[10px] mt-0.5">Round-trip booking</p>
              </div>
            </div>
          )}

          {/* ── Notes ────────────────────────────────────────────────────── */}
          {showNotes && (
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-1.5">
                <FileText size={11} /> Notes
              </p>
              {booking.operator_note && (
                <div className={!isDone ? 'mb-4' : ''}>
                  <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">From operator</p>
                  <p className="text-gray-600 text-sm leading-relaxed">{booking.operator_note}</p>
                </div>
              )}
              {!isDone && (
                <div>
                  <p className="text-[10px] text-gray-400 mb-1.5 uppercase tracking-wide">Your notes</p>
                  <textarea
                    value={driverNote}
                    onChange={(e) => setDriverNote(e.target.value)}
                    placeholder="Add a note about this job…"
                    rows={2}
                    className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5 text-gray-700 text-sm placeholder-gray-400 focus:outline-none focus:border-[#d5a538]/40 resize-none"
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
                  <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">Your notes</p>
                  <p className="text-gray-500 text-sm leading-relaxed">{booking.driver_notes}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Photos / damage report ───────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                <Camera size={11} /> Photos
              </p>
              {!isDone && (
                <button
                  onClick={() => photoInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="flex items-center gap-1.5 text-[#d5a538] text-xs font-semibold bg-[#d5a538]/10 border border-[#d5a538]/25 px-3 py-1.5 rounded-xl active:opacity-70 disabled:opacity-40"
                >
                  {uploadingPhoto ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
                  {uploadingPhoto ? 'Uploading…' : 'Add Photo'}
                </button>
              )}
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) uploadPhoto(file)
                e.target.value = ''
              }}
            />
            {photos.length === 0 ? (
              <p className="text-gray-300 text-xs text-center py-4">
                {isDone ? 'No photos recorded' : 'Tap Add Photo to capture damage or evidence'}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {photos.map(photo => (
                  <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt="" className="w-full h-full object-cover" />
                    {!isDone && (
                      <button
                        onClick={() => deletePhoto(photo.id, photo.url)}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center active:opacity-70"
                      >
                        <Trash2 size={11} className="text-red-400" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Dispatch + SOS ───────────────────────────────────────────── */}
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

      {/* ── Expense modal ──────────────────────────────────────────────────── */}
      {showExpenseModal && (
        <ExpenseModal
          onConfirm={handleCompleteWithExpenses}
          onSkip={() => { setShowExpenseModal(false); handleCompleteWithExpenses([]) }}
          loading={updating}
        />
      )}
    </>
  )
}
