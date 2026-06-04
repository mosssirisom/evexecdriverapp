'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronRight, Clock, Car } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BookingStatusBadge } from '@/components/badges'
import { formatDate, formatTime } from '@/lib/format'
import type { Booking } from '@/lib/types'

type Tab = 'upcoming' | 'active' | 'completed'
type DateFilter = 'all' | 'today' | 'tomorrow' | '7days'

function BookingCard({ booking }: { booking: Booking }) {
  return (
    <Link href={`/jobs/${booking.id}`}>
      <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4 active:opacity-80 transition-opacity">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[#d5a538] font-semibold text-sm">{formatTime(booking.travel_time)}</span>
            <span className="text-white/20 text-xs">{formatDate(booking.travel_date)}</span>
          </div>
          <div className="flex items-center gap-2">
            <BookingStatusBadge status={booking.status} />
            <ChevronRight size={14} className="text-white/30" />
          </div>
        </div>

        <p className="text-white font-medium text-sm mb-0.5">{booking.customer_name}</p>
        {booking.journey_type && (
          <p className="text-white/30 text-xs mb-3 capitalize">{booking.journey_type.replace(/_/g, ' ')}</p>
        )}

        <div className="space-y-1.5">
          <div className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] mt-1.5 flex-shrink-0" />
            <p className="text-white/50 text-xs leading-tight">
              {booking.pickup_location ?? booking.airport ?? '—'}
            </p>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
            <p className="text-white/50 text-xs leading-tight">{booking.dropoff_address ?? booking.airport ?? '—'}</p>
          </div>
        </div>

        {booking.quoted_price && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/5">
            {booking.passengers > 0 && (
              <span className="text-white/40 text-xs flex items-center gap-1">
                <Clock size={11} /> {booking.passengers} pax
              </span>
            )}
            <span className="ml-auto text-[#d5a538] font-semibold text-sm">
              £{booking.quoted_price.toFixed(0)}
            </span>
          </div>
        )}
      </div>
    </Link>
  )
}

export default function JobsPage() {
  const [tab, setTab] = useState<Tab>('upcoming')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  const loadBookings = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('bookings')
      .select('*')
      .eq('assigned_driver_id', user.id)
      .in('status', ['accepted', 'confirmed', 'Dispatched', 'en_route', 'arrived', 'active', 'completed', 'Completed', 'cancelled'])
      .order('travel_date', { ascending: false })
      .order('travel_time', { ascending: true })

    if (data) setBookings(data)
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadBookings() }, [loadBookings])

  const upcoming = bookings.filter((b) => ['accepted', 'confirmed', 'Dispatched'].includes(b.status))
  const active = bookings.filter((b) => ['en_route', 'arrived', 'active'].includes(b.status))
  const completed = bookings.filter((b) => ['completed', 'Completed', 'cancelled'].includes(b.status))

  const applyDateFilter = (list: Booking[]) => {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const todayStr = fmt(now)
    const tomorrowStr = fmt(new Date(now.getTime() + 86400000))
    const in7Str = fmt(new Date(now.getTime() + 7 * 86400000))
    if (dateFilter === 'today') return list.filter(b => b.travel_date === todayStr)
    if (dateFilter === 'tomorrow') return list.filter(b => b.travel_date === tomorrowStr)
    if (dateFilter === '7days') return list.filter(b => b.travel_date && b.travel_date >= todayStr && b.travel_date <= in7Str)
    return list
  }

  const baseList = tab === 'upcoming' ? upcoming : tab === 'active' ? active : completed
  const currentList = applyDateFilter(baseList)

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="min-h-screen bg-[#020813] px-4 pt-12 pb-4">
      <div className="mb-6">
        <h1 className="text-white font-bold text-xl">Board</h1>
        <p className="text-white/40 text-xs mt-1">{today}</p>
      </div>

      {/* Date filter pills */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 no-scrollbar">
        {([
          { key: 'all' as DateFilter, label: 'All' },
          { key: 'today' as DateFilter, label: 'Today' },
          { key: 'tomorrow' as DateFilter, label: 'Tomorrow' },
          { key: '7days' as DateFilter, label: '7 Days' },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setDateFilter(key)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
            style={dateFilter === key
              ? { background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)', color: '#020813', borderColor: 'transparent' }
              : { background: 'transparent', color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.1)' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-5">
        {([
          { key: 'upcoming' as Tab, label: `Upcoming (${upcoming.length})` },
          { key: 'active' as Tab, label: `Active (${active.length})` },
          { key: 'completed' as Tab, label: 'Done' },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === key ? 'text-[#020813]' : 'text-white/40 hover:text-white/60'
            }`}
            style={tab === key ? { background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)' } : {}}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 rounded-full border-2 border-[#d5a538] border-t-transparent animate-spin" />
        </div>
      ) : currentList.length === 0 ? (
        <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-10 text-center">
          <Car size={28} className="mx-auto mb-2 text-white/20" />
          <p className="text-white/30 text-sm">No {tab} jobs</p>
        </div>
      ) : (
        <div className="space-y-3">
          {currentList.map((booking) => (
            <BookingCard key={booking.id} booking={booking} />
          ))}
        </div>
      )}
    </div>
  )
}
