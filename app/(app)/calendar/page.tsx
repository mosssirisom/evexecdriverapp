'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Car, Ban } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatTime } from '@/lib/format'
import type { Booking } from '@/lib/types'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export default function CalendarPage() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [bookings, setBookings] = useState<Booking[]>([])
  const [unavailableDates, setUnavailableDates] = useState<Set<string>>(new Set())
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate())
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  const supabase = createClient()

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const lastDate = new Date(year, month + 1, 0).getDate()
    const lastDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDate).padStart(2, '0')}`

    const [bookingsRes, unavailRes] = await Promise.all([
      supabase
        .from('bookings')
        .select('*')
        .eq('assigned_driver_id', user.id)
        .gte('travel_date', firstDay)
        .lte('travel_date', lastDay)
        .order('travel_time', { ascending: true }),
      supabase
        .from('driver_unavailable_dates')
        .select('date')
        .eq('driver_id', user.id)
        .gte('date', firstDay)
        .lte('date', lastDay),
    ])

    if (bookingsRes.data) setBookings(bookingsRes.data)
    if (unavailRes.data) {
      setUnavailableDates(new Set(unavailRes.data.map((r) => r.date)))
    }
    setLoading(false)
  }, [supabase, year, month])

  useEffect(() => { load() }, [load])

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
    setSelectedDay(null)
  }

  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
    setSelectedDay(null)
  }

  const toggleAvailability = async (dateStr: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || toggling) return
    setToggling(true)

    const isUnavailable = unavailableDates.has(dateStr)
    if (isUnavailable) {
      await supabase
        .from('driver_unavailable_dates')
        .delete()
        .eq('driver_id', user.id)
        .eq('date', dateStr)
      setUnavailableDates(prev => { const s = new Set(prev); s.delete(dateStr); return s })
    } else {
      await supabase
        .from('driver_unavailable_dates')
        .insert({ driver_id: user.id, date: dateStr })
      setUnavailableDates(prev => new Set([...prev, dateStr]))
    }
    setToggling(false)
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  let startOffset = new Date(year, month, 1).getDay() - 1
  if (startOffset === -1) startOffset = 6

  const bookingsByDay: Record<string, Booking[]> = {}
  bookings.forEach(b => {
    if (b.travel_date) {
      bookingsByDay[b.travel_date] = bookingsByDay[b.travel_date] ?? []
      bookingsByDay[b.travel_date].push(b)
    }
  })

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const selectedDateStr = selectedDay
    ? `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`
    : null

  const selectedBookings = selectedDateStr ? (bookingsByDay[selectedDateStr] ?? []) : []
  const selectedIsUnavailable = selectedDateStr ? unavailableDates.has(selectedDateStr) : false
  const selectedIsPast = selectedDateStr ? selectedDateStr < todayStr : false

  const totalMonthJobs = bookings.length
  const totalMonthEarnings = bookings.reduce((s, b) => s + (b.quoted_price ?? 0), 0)

  return (
    <div className="min-h-screen bg-[#020813] px-4 pt-12 pb-4">
      <div className="mb-5">
        <h1 className="text-white font-bold text-xl">Calendar</h1>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center active:opacity-70">
          <ChevronLeft size={18} className="text-white/60" />
        </button>
        <span className="text-white font-semibold text-base">{MONTHS[month]} {year}</span>
        <button onClick={nextMonth} className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center active:opacity-70">
          <ChevronRight size={18} className="text-white/60" />
        </button>
      </div>

      {/* Monthly summary */}
      {!loading && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-3 text-center">
            <p className="text-white/30 text-[10px] uppercase tracking-wide">Jobs this month</p>
            <p className="text-white font-bold text-xl mt-0.5">{totalMonthJobs}</p>
          </div>
          <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-3 text-center">
            <p className="text-white/30 text-[10px] uppercase tracking-wide">Earnings</p>
            <p className="text-[#d5a538] font-bold text-xl mt-0.5">£{totalMonthEarnings.toFixed(0)}</p>
          </div>
        </div>
      )}

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-[9px] font-semibold text-white/25 py-1 uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1 mb-5">
        {Array.from({ length: startOffset }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayBookings = bookingsByDay[dateStr] ?? []
          const isToday = dateStr === todayStr
          const isSelected = selectedDay === day
          const hasJobs = dayBookings.length > 0
          const isUnavailable = unavailableDates.has(dateStr)

          return (
            <button
              key={day}
              onClick={() => setSelectedDay(day === selectedDay ? null : day)}
              className="aspect-square rounded-xl flex flex-col items-center justify-center transition-all active:scale-95"
              style={{
                background: isSelected
                  ? 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)'
                  : isUnavailable
                  ? 'rgba(239,68,68,0.12)'
                  : isToday
                  ? 'rgba(213,165,56,0.18)'
                  : hasJobs
                  ? 'rgba(255,255,255,0.07)'
                  : 'rgba(255,255,255,0.02)',
              }}
            >
              <span className={`text-sm font-semibold leading-none ${
                isSelected ? 'text-[#020813]'
                : isUnavailable ? 'text-red-400/70'
                : isToday ? 'text-[#d5a538]'
                : 'text-white/70'
              }`}>
                {day}
              </span>
              {hasJobs && (
                <div className="flex gap-0.5 mt-1">
                  {dayBookings.slice(0, 3).map((_, idx) => (
                    <div
                      key={idx}
                      className="w-1 h-1 rounded-full"
                      style={{ background: isSelected ? '#020813' : '#d5a538' }}
                    />
                  ))}
                </div>
              )}
              {isUnavailable && !hasJobs && !isSelected && (
                <div className="w-1.5 h-0.5 rounded-full bg-red-400/50 mt-0.5" />
              )}
            </button>
          )
        })}
      </div>

      {/* Selected day */}
      {selectedDateStr && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold text-sm">
              {selectedDay} {MONTHS[month]}
            </h2>
            <span className="text-white/30 text-xs">
              {selectedBookings.length} job{selectedBookings.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Availability toggle — only for future/today days with no bookings */}
          {!loading && !selectedIsPast && selectedBookings.length === 0 && (
            <button
              onClick={() => toggleAvailability(selectedDateStr)}
              disabled={toggling}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold mb-3 border transition-opacity disabled:opacity-50 active:opacity-70 ${
                selectedIsUnavailable
                  ? 'border-red-500/30 text-red-400 bg-red-500/8'
                  : 'border-white/10 text-white/40 bg-white/3'
              }`}
            >
              <Ban size={14} />
              {selectedIsUnavailable ? 'Mark as available' : 'Mark as unavailable'}
            </button>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 rounded-full border-2 border-[#d5a538] border-t-transparent animate-spin" />
            </div>
          ) : selectedBookings.length === 0 ? (
            <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-8 text-center">
              <Car size={24} className="mx-auto mb-2 text-white/20" />
              <p className="text-white/30 text-sm">
                {selectedIsUnavailable ? 'Marked as unavailable' : 'No jobs this day'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedBookings.map(job => (
                <Link key={job.id} href={`/jobs/${job.id}`}>
                  <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4 active:opacity-80 transition-opacity">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[#d5a538] font-semibold text-sm">{formatTime(job.travel_time)}</span>
                      {job.quoted_price != null && (
                        <span className="text-[#d5a538] font-bold text-sm">£{job.quoted_price.toFixed(0)}</span>
                      )}
                    </div>
                    <p className="text-white font-medium text-sm mb-2">{job.customer_name}</p>
                    <div className="space-y-1">
                      <div className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] mt-1.5 flex-shrink-0" />
                        <p className="text-white/50 text-xs leading-tight">
                          {job.pickup_location ?? job.airport ?? '—'}
                        </p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                        <p className="text-white/50 text-xs leading-tight">{job.dropoff_address ?? '—'}</p>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
