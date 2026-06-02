'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, MapPin, Loader2, ClipboardList, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatDate, formatTime } from '@/lib/format'
import type { Booking } from '@/lib/types'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export default function HistoryPage() {
  const router = useRouter()
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
      .in('status', ['completed', 'Completed'])
      .order('travel_date', { ascending: false })
      .order('travel_time', { ascending: false })

    if (data) setBookings(data)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

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
    <div className="min-h-screen bg-[#020813] px-4 pt-12 pb-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-white/40 active:text-white/70">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-white font-bold text-xl">Earnings Report</h1>
      </div>

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

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-[#d5a538]" size={28} />
        </div>
      ) : (
        <>
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
