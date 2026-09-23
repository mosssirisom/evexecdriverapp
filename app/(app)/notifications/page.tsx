'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, Bell, ChevronRight, Trash2,
  Car, MapPin, Users, CheckCircle2, XCircle, Clock, Navigation, UserCheck, AlertCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PickupIcon } from '@/components/route-icons'
import { formatDate, formatTime } from '@/lib/format'
import type { Booking, BookingStatus } from '@/lib/types'

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

interface StatusMeta {
  label: string
  Icon: React.ElementType
  iconColor: string
  bgColor: string
}

const STATUS_META: Record<BookingStatus, StatusMeta> = {
  pending:              { label: 'Awaiting confirmation', Icon: Clock,        iconColor: '#f59e0b', bgColor: 'rgba(245,158,11,0.12)' },
  accepted:             { label: 'Job confirmed',         Icon: UserCheck,    iconColor: '#60a5fa', bgColor: 'rgba(96,165,250,0.12)' },
  confirmed:            { label: 'Job confirmed',         Icon: UserCheck,    iconColor: '#60a5fa', bgColor: 'rgba(96,165,250,0.12)' },
  Dispatched:           { label: 'Job dispatched',        Icon: Navigation,   iconColor: '#a78bfa', bgColor: 'rgba(167,139,250,0.12)' },
  en_route:             { label: 'Journey started',       Icon: Car,          iconColor: '#a78bfa', bgColor: 'rgba(167,139,250,0.12)' },
  'En Route':           { label: 'Journey started',       Icon: Car,          iconColor: '#a78bfa', bgColor: 'rgba(167,139,250,0.12)' },
  arrived:              { label: 'Arrived at pickup',     Icon: MapPin,       iconColor: '#22d3ee', bgColor: 'rgba(34,211,238,0.12)' },
  Arrived:              { label: 'Arrived at pickup',     Icon: MapPin,       iconColor: '#22d3ee', bgColor: 'rgba(34,211,238,0.12)' },
  active:               { label: 'Passenger on board',   Icon: Users,        iconColor: '#10b981', bgColor: 'rgba(16,185,129,0.12)' },
  Active:               { label: 'Passenger on board',   Icon: Users,        iconColor: '#10b981', bgColor: 'rgba(16,185,129,0.12)' },
  'Passenger On Board': { label: 'Passenger on board',   Icon: Users,        iconColor: '#10b981', bgColor: 'rgba(16,185,129,0.12)' },
  completed:            { label: 'Job completed',         Icon: CheckCircle2, iconColor: 'rgba(255,255,255,0.4)', bgColor: 'rgba(255,255,255,0.06)' },
  Completed:            { label: 'Job completed',         Icon: CheckCircle2, iconColor: 'rgba(255,255,255,0.4)', bgColor: 'rgba(255,255,255,0.06)' },
  rejected:             { label: 'Job rejected',          Icon: XCircle,      iconColor: '#f87171', bgColor: 'rgba(248,113,113,0.12)' },
  cancelled:            { label: 'Job cancelled',         Icon: XCircle,      iconColor: '#f87171', bgColor: 'rgba(248,113,113,0.12)' },
  Cancelled:            { label: 'Job cancelled',         Icon: XCircle,      iconColor: '#f87171', bgColor: 'rgba(248,113,113,0.12)' },
  'No Show':            { label: 'No show',               Icon: AlertCircle,  iconColor: '#f59e0b', bgColor: 'rgba(245,158,11,0.12)' },
  CRITICAL_UNALLOCATED: { label: 'Needs driver — urgent', Icon: AlertCircle,  iconColor: '#f87171', bgColor: 'rgba(248,113,113,0.15)' },
}

const CLEARED_BEFORE_KEY = 'driverapp:notifications:clearedBefore'

export default function NotificationsPage() {
  const router = useRouter()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [clearedBefore, setClearedBefore] = useState<number>(0)

  const supabase = createClient()

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CLEARED_BEFORE_KEY)
      if (stored) setClearedBefore(Number(stored))
    } catch { /* localStorage unavailable (private browsing, etc.) */ }
  }, [])

  const loadActivity = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('bookings')
      .select('*')
      .eq('assigned_driver_id', user.id)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(30)

    setBookings(data ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadActivity() }, [loadActivity])

  const visibleBookings = bookings.filter((b) => {
    if (!clearedBefore) return true
    const updated = b.updated_at ? new Date(b.updated_at).getTime() : 0
    return updated > clearedBefore
  })

  const clearNotifications = () => {
    const cutoff = Date.now()
    setClearedBefore(cutoff)
    try { localStorage.setItem(CLEARED_BEFORE_KEY, String(cutoff)) } catch { /* ignore */ }
  }

  return (
    <div className="min-h-screen bg-[#eaeff7] px-4 pt-12 pb-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-[#7a9ab8] active:text-[#2d4c6d]">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-[#060C1A] font-bold text-xl flex-1">Activity</h1>
        {visibleBookings.length > 0 && (
          <button
            onClick={clearNotifications}
            className="flex items-center gap-1 text-[#7a9ab8] active:text-[#2d4c6d] text-xs font-medium"
          >
            <Trash2 size={14} />
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 rounded-full border-2 border-[#d5a538] border-t-transparent animate-spin" />
        </div>
      ) : visibleBookings.length === 0 ? (
        <div className="bg-white border border-[#c4d4e4] rounded-2xl p-12 text-center">
          <Bell size={32} className="mx-auto mb-3 text-[#a8c0d4]" />
          <p className="text-[#7a9ab8] text-sm">No activity yet</p>
          <p className="text-[#a8c0d4] text-xs mt-1">Your job history will appear here</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {visibleBookings.map((booking) => {
            const meta = STATUS_META[booking.status]
            if (!meta) return null
            const { label, Icon, iconColor, bgColor } = meta
            const pickup = booking.pickup_location ?? booking.airport ?? 'See job details'
            return (
              <Link key={booking.id} href={`/jobs/${booking.id}`}>
                <div className="bg-white border border-[#c4d4e4] rounded-2xl p-4 active:opacity-80 transition-opacity">
                  <div className="flex items-start gap-3">
                    {/* Status icon */}
                    <div
                      className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center mt-0.5"
                      style={{ background: bgColor }}
                    >
                      <Icon size={16} style={{ color: iconColor }} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[#060C1A] font-semibold text-sm leading-tight">{booking.customer_name}</p>
                          <p className="text-[#7a9ab8] text-[11px] mt-0.5">{label}</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-[#7a9ab8] text-[10px]">{timeAgo(booking.updated_at)}</span>
                          <ChevronRight size={13} className="text-[#7a9ab8]" />
                        </div>
                      </div>

                      {/* Route */}
                      <div className="flex items-center gap-1.5 mt-2">
                        <PickupIcon booking={booking} size={11} />
                        <p className="text-[#4a6a8a] text-xs truncate">{pickup}</p>
                      </div>

                      {/* Date/time */}
                      {booking.travel_date && (
                        <p className="text-[#a8c0d4] text-[10px] mt-1">
                          {formatDate(booking.travel_date)}{booking.travel_time ? ` · ${formatTime(booking.travel_time)}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
