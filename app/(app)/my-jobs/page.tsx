'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { ChevronRight, Car, Navigation2, Phone, MapPin, PlaneLanding, Flag } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BookingStatusBadge } from '@/components/badges'
import { formatTime } from '@/lib/format'
import type { Booking, BookingStatus } from '@/lib/types'

const ACTIVE_STATUSES: BookingStatus[] = ['En Route', 'en_route', 'Arrived', 'arrived', 'Passenger On Board', 'Active', 'active']

function navigateTo(destination: string) {
  const dest = encodeURIComponent(destination)
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`, '_blank')
}

export default function MyJobsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const loadActiveJobs = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('bookings')
      .select('*')
      .eq('assigned_driver_id', user.id)
      .in('status', ACTIVE_STATUSES)
      .order('travel_date', { ascending: true })
      .order('travel_time', { ascending: true })
    if (data) setBookings(data)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadActiveJobs()

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      channelRef.current = supabase
        .channel('my-active-jobs')
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'bookings',
          filter: `assigned_driver_id=eq.${user.id}`,
        }, () => loadActiveJobs())
        .subscribe()
    })

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen bg-[#060C1A] px-4 pt-12 pb-4">
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
          <p className="text-white/20 text-xs mt-1">Jobs appear here once you start them</p>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const pickupAddress = booking.pickup_location ?? booking.airport ?? '—'
            const dropoffAddress = booking.dropoff_address ?? '—'
            return (
              <div key={booking.id} className="bg-[#0B1525] border border-white/8 rounded-2xl overflow-hidden">
                <div
                  className="px-4 py-2.5 flex items-center justify-between"
                  style={{
                    background:
                      booking.status === 'active' || booking.status === 'Active'
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
                        className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/10 bg-white/5 active:opacity-70"
                      >
                        <Phone size={15} className="text-[#d5a538]" />
                      </a>
                    )}
                  </div>

                  <div className="flex gap-2.5 mb-4">
                    {/* Vertical timeline icons */}
                    <div className="flex flex-col items-center flex-shrink-0 pt-[1px]">
                      {(booking.flight_number || (booking.journey_type ?? '').toLowerCase().includes('airport') || booking.airport) ? (
                        <PlaneLanding size={11} className="flex-shrink-0 text-[#10b981]" />
                      ) : (
                        <MapPin size={11} className="flex-shrink-0 text-[#d5a538]" />
                      )}
                      <div className="w-px flex-1 min-h-[12px] bg-white/10 my-[3px]" />
                      <Flag size={11} className="flex-shrink-0 text-white/30" />
                    </div>
                    {/* Addresses with nav buttons */}
                    <div className="flex-1 min-w-0 space-y-[7px]">
                      <div className="flex items-center gap-2">
                        <p className="flex-1 text-white/50 text-xs leading-tight truncate">{pickupAddress}</p>
                        <button onClick={() => navigateTo(pickupAddress)} className="text-[#d5a538] flex-shrink-0 active:opacity-70">
                          <Navigation2 size={14} />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="flex-1 text-white/35 text-xs leading-tight truncate">{dropoffAddress}</p>
                        <button onClick={() => navigateTo(dropoffAddress)} className="text-[#d5a538] flex-shrink-0 active:opacity-70">
                          <Navigation2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <Link href={`/jobs/${booking.id}`}>
                    <button
                      className="w-full py-2.5 rounded-xl font-semibold text-[#020813] text-sm flex items-center justify-center gap-1.5 active:opacity-80"
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
