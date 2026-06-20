'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  PoundSterling, Briefcase, TrendingUp, MapPin,
  ChevronLeft, ChevronRight, ClipboardList, Download,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatDate, formatTime } from '@/lib/format'
import type { Booking } from '@/lib/types'

type Period = 'today' | 'week' | 'month'
type View = 'overview' | 'report'

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const COMPLETED_STATUSES = ['completed', 'Completed']

function getDateRange(period: Period): { from: string; to: string } {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  if (period === 'today') {
    const today = fmt(now)
    return { from: today, to: today }
  }
  if (period === 'week') {
    const start = new Date(now)
    const day = now.getDay()
    const diff = day === 0 ? -6 : 1 - day
    start.setDate(now.getDate() + diff)
    return { from: fmt(start), to: fmt(now) }
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  return { from: fmt(start), to: fmt(now) }
}

function EarningsContent() {
  const searchParams = useSearchParams()
  const [view, setView] = useState<View>(searchParams.get('view') === 'report' ? 'report' : 'overview')
  const [period, setPeriod] = useState<Period>('week')

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('bookings')
      .select('*')
      .eq('assigned_driver_id', user.id)
      .in('status', COMPLETED_STATUSES)
      .order('travel_date', { ascending: false })
      .order('travel_time', { ascending: false })

    setBookings(data ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  // Overview
  const { from, to } = getDateRange(period)
  const periodBookings = bookings.filter(b => b.travel_date && b.travel_date >= from && b.travel_date <= to)
  const periodTotal = periodBookings.reduce((s, b) => s + (b.quoted_price ?? 0), 0)
  const periodTrips = periodBookings.length
  const perJob = periodTrips > 0 ? periodTotal / periodTrips : 0

  // Monthly report
  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`
  const monthBookings = bookings.filter(b => b.travel_date?.startsWith(monthPrefix))
  const monthEarnings = monthBookings.reduce((s, b) => s + (b.quoted_price ?? 0), 0)
  const allEarnings = bookings.reduce((s, b) => s + (b.quoted_price ?? 0), 0)

  const exportCSV = () => {
    const rows = [
      ['Date', 'Time', 'Customer', 'Pickup', 'Dropoff', 'Price (£)'],
      ...monthBookings.map(b => [
        b.travel_date ?? '',
        b.travel_time ? b.travel_time.slice(0, 5) : '',
        b.customer_name,
        (b.pickup_location ?? b.airport ?? '').replace(/,/g, ' '),
        (b.dropoff_address ?? '').replace(/,/g, ' '),
        b.quoted_price?.toFixed(2) ?? '',
      ]),
      [],
      ['', '', '', '', 'Total', monthEarnings.toFixed(2)],
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ev-exec-${monthPrefix}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-[#060C1A] px-4 pt-12 pb-4">
      <div className="mb-6">
        <h1 className="text-white font-bold text-xl">Earnings</h1>
        <p className="text-white/40 text-xs mt-1">Your payment summary</p>
      </div>

      {/* View Switcher */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-5">
        {(['overview', 'report'] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              view === v ? 'text-[#020813]' : 'text-white/40 hover:text-white/60'
            }`}
            style={view === v ? { background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)' } : {}}
          >
            {v === 'overview' ? 'Overview' : 'Monthly Report'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 rounded-full border-2 border-[#d5a538] border-t-transparent animate-spin" />
        </div>
      ) : view === 'overview' ? (
        <>
          {/* Period Selector */}
          <div className="flex gap-2 mb-5">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  period === p ? 'border-[#d5a538]/40 text-[#d5a538] bg-[#d5a538]/8' : 'border-white/8 text-white/40'
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>

          {/* Total Earnings Card */}
          <div
            className="rounded-2xl p-5 mb-5"
            style={{
              background: 'linear-gradient(135deg, rgba(213,165,56,0.15), rgba(169,121,24,0.08))',
              border: '1px solid rgba(213,165,56,0.25)',
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#d5a538]/70 mb-2">
              {PERIOD_LABELS[period]} Earnings
            </p>
            <div className="flex items-end gap-1">
              <PoundSterling size={24} className="text-[#d5a538] mb-1" />
              <span className="text-white font-bold text-4xl">
                {periodTotal.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-[#0B1525] border border-white/8 rounded-xl p-3 text-center">
              <Briefcase size={16} className="mx-auto mb-1 text-[#d5a538]" />
              <p className="text-white font-bold text-lg">{periodTrips}</p>
              <p className="text-white/30 text-[10px] uppercase tracking-wide">Jobs</p>
            </div>
            <div className="bg-[#0B1525] border border-white/8 rounded-xl p-3 text-center">
              <TrendingUp size={16} className="mx-auto mb-1 text-[#d5a538]" />
              <p className="text-white font-bold text-lg">£{perJob.toFixed(0)}</p>
              <p className="text-white/30 text-[10px] uppercase tracking-wide">Per Job avg</p>
            </div>
          </div>

          {/* Jobs list */}
          {periodBookings.length === 0 ? (
            <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-12 text-center">
              <PoundSterling size={28} className="mx-auto mb-3 text-white/20" />
              <p className="text-white/40 text-sm">
                No completed jobs {period === 'today' ? 'today' : `this ${period}`}
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-white font-semibold text-sm mb-3">Completed Jobs</h2>
              <div className="space-y-3">
                {periodBookings.map((booking) => {
                  const pickup = booking.pickup_location ?? booking.airport ?? '—'
                  const dropoff = booking.dropoff_address ?? '—'
                  return (
                    <div key={booking.id} className="bg-[#0B1525] border border-white/8 rounded-2xl p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-white font-medium text-sm">{booking.customer_name}</p>
                          <p className="text-white/30 text-xs mt-0.5">
                            {formatDate(booking.travel_date)}
                            {booking.travel_time ? ` · ${formatTime(booking.travel_time)}` : ''}
                          </p>
                        </div>
                        {booking.quoted_price != null && (
                          <p className="text-[#d5a538] font-bold">£{booking.quoted_price.toFixed(2)}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-white/30 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] flex-shrink-0" />
                        <span className="truncate">{pickup}</span>
                        <span className="text-white/20 mx-0.5 flex-shrink-0">→</span>
                        <MapPin size={10} className="text-red-400 flex-shrink-0" />
                        <span className="truncate">{dropoff}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {/* Month picker */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={prevMonth}
              className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center active:opacity-70"
            >
              <ChevronLeft size={18} className="text-white/60" />
            </button>
            <span className="text-white font-semibold text-base">{MONTHS[month]} {year}</span>
            <button
              onClick={nextMonth}
              className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center active:opacity-70"
            >
              <ChevronRight size={18} className="text-white/60" />
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-3 text-center">
              <p className="text-white/30 text-[9px] uppercase tracking-wide">This Month</p>
              <p className="text-white font-bold text-xl mt-0.5">{monthBookings.length}</p>
              <p className="text-white/20 text-[9px] mt-0.5">trips</p>
            </div>
            <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-3 text-center">
              <p className="text-white/30 text-[9px] uppercase tracking-wide">Earned</p>
              <p className="text-[#d5a538] font-bold text-xl mt-0.5">£{monthEarnings.toFixed(0)}</p>
              <p className="text-white/20 text-[9px] mt-0.5">this month</p>
            </div>
            <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-3 text-center">
              <p className="text-white/30 text-[9px] uppercase tracking-wide">All Time</p>
              <p className="text-[#d5a538] font-bold text-xl mt-0.5">£{allEarnings.toFixed(0)}</p>
              <p className="text-white/20 text-[9px] mt-0.5">{bookings.length} trips</p>
            </div>
          </div>

          {/* Weekly breakdown */}
          {monthBookings.length > 0 && (() => {
            const weeks: { label: string; trips: number; earn: number }[] = []
            const daysInMon = new Date(year, month + 1, 0).getDate()
            for (let w = 0; w < 5; w++) {
              const startD = w * 7 + 1
              if (startD > daysInMon) break
              const endD = Math.min(startD + 6, daysInMon)
              const wkBooks = monthBookings.filter(b => {
                const d = b.travel_date ? parseInt(b.travel_date.split('-')[2]) : 0
                return d >= startD && d <= endD
              })
              if (wkBooks.length === 0 && weeks.length === 0) return null
              weeks.push({ label: `${startD}–${endD} ${MONTHS[month].slice(0,3)}`, trips: wkBooks.length, earn: wkBooks.reduce((s, b) => s + (b.quoted_price ?? 0), 0) })
            }
            const maxEarn = Math.max(...weeks.map(w => w.earn), 1)
            return (
              <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4 mb-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 mb-3">Weekly Breakdown</p>
                <div className="space-y-2">
                  {weeks.map(w => (
                    <div key={w.label} className="flex items-center gap-3">
                      <span className="text-white/30 text-[10px] w-20 flex-shrink-0">{w.label}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${(w.earn / maxEarn) * 100}%`, background: 'linear-gradient(90deg, #f1c56a, #d5a538)' }}
                        />
                      </div>
                      <span className="text-[#d5a538] text-xs font-semibold w-12 text-right flex-shrink-0">
                        {w.earn > 0 ? `£${w.earn.toFixed(0)}` : `${w.trips} trips`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Export */}
          {monthBookings.length > 0 && (
            <button
              onClick={exportCSV}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-[#d5a538]/30 text-[#d5a538] text-sm font-semibold mb-4 bg-[#d5a538]/8 active:opacity-70 transition-opacity"
            >
              <Download size={15} />
              Export {MONTHS[month]} as CSV
            </button>
          )}

          {/* Job list */}
          {monthBookings.length === 0 ? (
            <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-12 text-center">
              <ClipboardList size={32} className="mx-auto mb-3 text-white/20" />
              <p className="text-white/40 text-sm">No completed trips in {MONTHS[month]}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {monthBookings.map((job) => {
                const pickup = job.pickup_location ?? job.airport ?? '—'
                const dropoff = job.dropoff_address ?? '—'
                return (
                  <div key={job.id} className="bg-[#0B1525] border border-white/8 rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <p className="text-white font-semibold text-sm">{job.customer_name}</p>
                        <p className="text-white/30 text-xs mt-0.5">
                          {formatDate(job.travel_date)}{job.travel_time ? ` · ${formatTime(job.travel_time)}` : ''}
                        </p>
                      </div>
                      {job.quoted_price != null && (
                        <span className="text-[#d5a538] font-bold text-base flex-shrink-0">
                          £{job.quoted_price.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] flex-shrink-0" />
                        <p className="text-white/50 text-xs truncate">{pickup}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin size={8} className="text-red-400 flex-shrink-0 ml-[1px]" />
                        <p className="text-white/50 text-xs truncate">{dropoff}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function EarningsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#060C1A] flex items-center justify-center">
        <div className="w-7 h-7 rounded-full border-2 border-[#d5a538] border-t-transparent animate-spin" />
      </div>
    }>
      <EarningsContent />
    </Suspense>
  )
}
