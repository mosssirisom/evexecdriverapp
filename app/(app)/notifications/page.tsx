'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Bell, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BookingStatusBadge } from '@/components/badges'
import { formatDate, formatTime } from '@/lib/format'
import type { Booking } from '@/lib/types'

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function NotificationsPage() {
  const router = useRouter()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  const loadActivity = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('bookings')
      .select('*')
      .eq('assigned_driver_id', user.id)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(20)

    setBookings(data ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadActivity() }, [loadActivity])

  return (
    <div className="min-h-screen bg-[#060C1A] px-4 pt-12 pb-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-white/40 active:text-white/70">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-white font-bold text-xl">Notifications</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 rounded-full border-2 border-[#d5a538] border-t-transparent animate-spin" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-12 text-center">
          <Bell size={32} className="mx-auto mb-3 text-white/20" />
          <p className="text-white/40 text-sm">No notifications</p>
          <p className="text-white/20 text-xs mt-1">You&apos;re all caught up</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => (
            <Link key={booking.id} href={`/jobs/${booking.id}`}>
              <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4 active:opacity-80 transition-opacity">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <BookingStatusBadge status={booking.status} />
                    <span className="text-white/25 text-[10px]">{timeAgo(booking.updated_at)}</span>
                  </div>
                  <ChevronRight size={14} className="text-white/30 flex-shrink-0" />
                </div>
                <p className="text-white font-medium text-sm">{booking.customer_name}</p>
                <p className="text-white/40 text-xs mt-1">
                  {booking.pickup_location ?? booking.airport ?? 'See job details'}
                </p>
                {booking.travel_date && (
                  <p className="text-white/25 text-[11px] mt-1">
                    {formatDate(booking.travel_date)}{booking.travel_time ? ` · ${formatTime(booking.travel_time)}` : ''}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
