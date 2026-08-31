'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronRight, Car, Users, Search, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BookingStatusBadge } from '@/components/badges'
import { RouteDisplay } from '@/components/route-icons'
import { formatDate, formatTime, paymentInfo } from '@/lib/format'
import type { Booking } from '@/lib/types'

type Tab = 'upcoming' | 'active' | 'completed'
type DateFilter = 'all' | 'today' | 'tomorrow' | '7days'

function bookingDateTimeValue(booking: Booking) {
  const date = booking.travel_date || '9999-12-31'
  const time = booking.travel_time || '23:59:59'
  return new Date(`${date}T${time}`).getTime()
}

function sortNearestFirst(list: Booking[]) {
  return [...list].sort((a, b) => bookingDateTimeValue(a) - bookingDateTimeValue(b))
}

function BookingCard({ booking }: { booking: Booking }) {
  return (
    <Link href={`/jobs/${booking.id}`}>
      <div className="bg-white border border-gray-200 rounded-2xl p-4 active:opacity-80 transition-opacity">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[#d5a538] font-semibold text-sm">{formatTime(booking.travel_time)}</span>
            <span className="text-gray-300 text-xs">{formatDate(booking.travel_date)}</span>
          </div>
          <div className="flex items-center gap-2">
            <BookingStatusBadge status={booking.status} />
            <ChevronRight size={14} className="text-gray-400" />
          </div>
        </div>

        <div className="flex items-baseline justify-between gap-2 mb-0.5">
          <p className="text-gray-900 font-medium text-sm">{booking.customer_name}</p>
          {booking.ref && (
            <span className="text-gray-400 text-[10px] font-mono flex-shrink-0">{booking.ref}</span>
          )}
        </div>
        {booking.journey_type && (
          <p className="text-gray-400 text-xs mb-3 capitalize">{booking.journey_type.replace(/_/g, ' ')}</p>
        )}

        <RouteDisplay booking={booking} />

        {(booking.quoted_price || booking.payment_method || booking.payment_status) && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
            {booking.passengers > 0 && (
              <span className="text-gray-400 text-xs flex items-center gap-1">
                <Users size={11} /> {booking.passengers}
              </span>
            )}
            {(() => {
              const p = paymentInfo(booking.payment_method, booking.payment_status)
              return (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${p.className}`}>
                  {p.text}
                </span>
              )
            })()}
            {booking.quoted_price && (
              <span className="ml-auto text-[#d5a538] font-semibold text-sm">
                £{booking.quoted_price.toFixed(0)}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  )
}

export default function JobsPage() {
  const [tab, setTab] = useState<Tab>('active')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const supabase = createClient()

  const loadBookings = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('bookings')
      .select('*')
      .eq('assigned_driver_id', user.id)
      .in('status', ['accepted', 'confirmed', 'Dispatched', 'En Route', 'en_route', 'Passenger On Board', 'Arrived', 'arrived', 'Active', 'active', 'No Show', 'completed', 'Completed', 'cancelled', 'Cancelled'])
      .order('travel_date', { ascending: true })
      .order('travel_time', { ascending: true })

    if (data) setBookings(sortNearestFirst(data))
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadBookings() }, [loadBookings])

  const upcoming = sortNearestFirst(bookings.filter((b) => ['accepted', 'confirmed', 'Dispatched'].includes(b.status)))
  const active = sortNearestFirst(bookings.filter((b) => ['En Route', 'en_route', 'Passenger On Board', 'Arrived', 'arrived', 'Active', 'active'].includes(b.status)))
  const completed = sortNearestFirst(bookings.filter((b) => ['completed', 'Completed', 'cancelled', 'Cancelled', 'No Show'].includes(b.status)))

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
  const applySearch = (list: Booking[]) => {
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(b =>
      b.customer_name.toLowerCase().includes(q) ||
      (b.ref ?? '').toLowerCase().includes(q)
    )
  }
  const currentList = sortNearestFirst(applySearch(applyDateFilter(baseList)))

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="min-h-screen bg-[#f8fafc] px-4 pt-12 pb-4">
      <div className="mb-4">
        <h1 className="text-gray-900 font-bold text-xl">Jobs</h1>
        <p className="text-gray-400 text-xs mt-1">{today}</p>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search by name or ref (EVX-…)"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-gray-100 border border-gray-200 rounded-xl pl-8 pr-8 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-[#d5a538]/50"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
            <X size={14} />
          </button>
        )}
      </div>

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

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5">
        {([
          { key: 'active' as Tab, label: `Active (${active.length})` },
          { key: 'upcoming' as Tab, label: `Upcoming (${upcoming.length})` },
          { key: 'completed' as Tab, label: 'Done' },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === key ? 'text-[#020813]' : 'text-gray-400 hover:text-gray-500'
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
        <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
          <Car size={28} className="mx-auto mb-2 text-gray-300" />
          <p className="text-gray-400 text-sm">No {tab} jobs</p>
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
