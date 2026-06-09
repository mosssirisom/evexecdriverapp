'use client'

import { useEffect, useState, useCallback } from 'react'
import { PoundSterling, Briefcase, TrendingUp, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getDriverByEmail } from '@/lib/getDriver'
import type { Booking } from '@/lib/types'

type Period = 'today' | 'week' | 'month'

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
}

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

export default function EarningsPage() {
  const [period, setPeriod] = useState<Period>('week')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  const loadEarnings = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return

    const driver = await getDriverByEmail(supabase, user.email)
    if (!driver) return

    const { from, to } = getDateRange(period)

    const { data } = await supabase
      .from('bookings')
      .select('*')
      .eq('assigned_driver_id', driver.id)
      .in('status', COMPLETED_STATUSES)
      .gte('travel_date', from)
      .lte('travel_date', to)
      .order('travel_date', { ascending: false })
      .order('travel_time', { ascending: false })

    setBookings(data ?? [])
    setLoading(false)
  }, [period, supabase])

  useEffect(() => { loadEarnings() }, [loadEarnings])

  const total = bookings.reduce((sum, b) => sum + (b.quoted_price ?? 0), 0)
  const trips = bookings.length
  const perJob = trips > 0 ? total / trips : 0

  return (
    <div className="min-h-screen bg-[#020813] px-4 pt-12 pb-4">
      <div className="mb-6">
        <h1 className="text-white font-bold text-xl">Earnings</h1>
        <p className="text-white/40 text-xs mt-1">Your payment summary</p>
      </div>

      {/* Period Selector */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-5">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              period === p ? 'text-[#020813]' : 'text-white/40 hover:text-white/60'
            }`}
            style={period === p ? { background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)' } : {}}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 rounded-full border-2 border-[#d5a538] border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
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
                {total.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-[#0B1525] border border-white/8 rounded-xl p-3 text-center">
              <Briefcase size={16} className="mx-auto mb-1 text-[#d5a538]" />
              <p className="text-white font-bold text-lg">{trips}</p>
              <p className="text-white/30 text-[10px] uppercase tracking-wide">Jobs</p>
            </div>
            <div className="bg-[#0B1525] border border-white/8 rounded-xl p-3 text-center">
              <TrendingUp size={16} className="mx-auto mb-1 text-[#d5a538]" />
              <p className="text-white font-bold text-lg">£{perJob.toFixed(0)}</p>
              <p className="text-white/30 text-[10px] uppercase tracking-wide">Per Job avg</p>
            </div>
          </div>

          {/* Jobs list */}
          {bookings.length === 0 ? (
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
                {bookings.map((booking) => {
                  const pickup = booking.pickup_location ?? booking.airport ?? '—'
                  const dropoff = booking.dropoff_address ?? '—'
                  return (
                    <div key={booking.id} className="bg-[#0B1525] border border-white/8 rounded-2xl p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-white font-medium text-sm">{booking.customer_name}</p>
                          <p className="text-white/30 text-xs mt-0.5">
                            {booking.travel_date}
                            {booking.travel_time ? ` · ${booking.travel_time}` : ''}
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
      )}
    </div>
  )
}
