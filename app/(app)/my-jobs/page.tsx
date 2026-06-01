'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronRight, Car, Navigation2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BookingStatusBadge } from '@/components/badges'
import { formatTime } from '@/lib/format'
import type { Booking } from '@/lib/types'

function openMaps(address: string) {
  const encoded = encodeURIComponent(address)
  window.open(`https://maps.google.com/?q=${encoded}`, '_blank')
}

export default function MyJobsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  const loadActiveJobs = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('bookings')
      .select('*')
      .eq('assigned_driver_id', user.id)
      .in('status', ['en_route', 'arrived', 'active'])
      .order('travel_date', { ascending: true })
      .order('travel_time', { ascending: true })

    if (data) setBookings(data)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadActiveJobs()
    const interval = setInterval(loadActiveJobs, 30_000)
    return () => clearInterval(interval)
  }, [loadActiveJobs])

  return (
    <div className="min-h-screen bg-[#020813] px-4 pt-12 pb-4">
      <div className="mb-6">
        <h1 className="text-white font-bold text-xl">Active</h1>
        <p className="text-white/40 text-xs mt-1">Jobs currently in progress</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 rounded-full border-2 border-[#d5a538] border-t-transparent animate-spin" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-12 text-center">
          <Car size={32} className="mx-auto mb-3 text-white/20" />
          <p className="text-white/40 text-sm">No active jobs right now</p>
          <p className="text-white/20 text-xs mt-1">Jobs will appear here once you start them</p>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const pickupAddress = booking.pickup_location ?? booking.airport ?? '—'
            const dropoffAddress = booking.dropoff_address ?? '—'
            return (
              <div key={booking.id} className="bg-[#0B1525] border border-white/8 rounded-2xl overflow-hidden">
                {/* Status bar */}
                <div
                  className="px-4 py-2.5 flex items-center justify-between"
                  style={{
                    background:
                      booking.status === 'active'
                        ? 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))'
                        : booking.status === 'arrived'
                        ? 'linear-gradient(135deg, rgba(6,182,212,0.15), rgba(6,182,212,0.05))'
                        : 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(139,92,246,0.05))',
                  }}
                >
                  <BookingStatusBadge status={booking.status} />
                  {booking.quoted_price && (
                    <span className="text-[#d5a538] font-bold text-sm">
                      £{booking.quoted_price.toFixed(2)}
                    </span>
                  )}
                </div>

                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-white font-semibold text-sm">{booking.customer_name}</p>
                      <p className="text-white/40 text-xs mt-0.5">{formatTime(booking.travel_time)}</p>
                    </div>
                    {booking.customer_phone && (
                      <a
                        href={`tel:${booking.customer_phone}`}
                        className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/10 bg-white/5"
                      >
                        <span className="text-[#d5a538] text-xs font-bold">CALL</span>
                      </a>
                    )}
                  </div>

                  <div className="space-y-2 mb-3">
                    <div className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] mt-1.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-white/50 text-xs leading-tight truncate">{pickupAddress}</p>
                      </div>
                      <button
                        onClick={() => openMaps(pickupAddress)}
                        className="text-[#d5a538] flex-shrink-0"
                      >
                        <Navigation2 size={14} />
                      </button>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-white/50 text-xs leading-tight truncate">{dropoffAddress}</p>
                      </div>
                      <button
                        onClick={() => openMaps(dropoffAddress)}
                        className="text-[#d5a538] flex-shrink-0"
                      >
                        <Navigation2 size={14} />
                      </button>
                    </div>
                  </div>

                  <Link href={`/jobs/${booking.id}`}>
                    <button
                      className="w-full py-2.5 rounded-xl font-semibold text-[#020813] text-sm flex items-center justify-center gap-1.5"
                      style={{ background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)' }}
                    >
                      Update Status <ChevronRight size={14} />
                    </button>
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
