'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Car, MapPin, Clock, ChevronRight, Bell, Briefcase, Star, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BookingStatusBadge } from '@/components/badges'
import { AttestationBanner } from '@/components/attestation-banner'
import type { Booking, Driver } from '@/lib/types'

export default function DashboardPage() {
  const [driver, setDriver] = useState<Driver | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [isOnline, setIsOnline] = useState(false)
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: driverData }, { data: bookingData }] = await Promise.all([
      supabase.from('drivers').select('*').eq('id', user.id).single(),
      supabase
        .from('bookings')
        .select('*')
        .eq('assigned_driver_id', user.id)
        .in('status', ['accepted', 'confirmed', 'en_route', 'arrived', 'active'])
        .order('travel_date', { ascending: true })
        .order('travel_time', { ascending: true }),
    ])

    if (driverData) {
      setDriver(driverData)
      setIsOnline(driverData.is_online)
    }
    if (bookingData) setBookings(bookingData)
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  const toggleOnline = async () => {
    if (!driver) return
    const newStatus = !isOnline
    setIsOnline(newStatus)
    await supabase.from('drivers').update({ is_online: newStatus }).eq('id', driver.id)
  }

  const today = new Date().toISOString().split('T')[0]
  const todayBookings = bookings.filter((b) => b.travel_date === today)
  const activeBooking = bookings.find((b) => ['en_route', 'arrived', 'active'].includes(b.status))
  const upcomingBookings = todayBookings.filter((b) => ['accepted', 'confirmed'].includes(b.status))
  const completedToday = bookings.filter((b) => b.status === 'completed' && b.travel_date === today)

  const initials = driver?.full_name
    ? driver.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2)
    : '?'

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020813] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#d5a538] border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#020813] px-4 pt-12 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-white/40 text-xs uppercase tracking-widest">{greeting()}</p>
          <h1 className="text-white font-semibold text-lg mt-0.5">{driver?.full_name ?? 'Driver'}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/jobs"
            className="relative w-10 h-10 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center"
          >
            <Bell size={18} className="text-white/60" />
            {upcomingBookings.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#d5a538]" />
            )}
          </Link>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center font-semibold text-sm text-[#020813]"
            style={{ background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)' }}
          >
            {initials}
          </div>
        </div>
      </div>

      {/* Driver Attestation Loop — urgent confirmation banner */}
      <AttestationBanner />

      {/* Online Toggle */}
      <div
        onClick={toggleOnline}
        className="relative mb-5 rounded-2xl border cursor-pointer overflow-hidden transition-all duration-300 select-none"
        style={{
          background: isOnline
            ? 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))'
            : 'rgba(255,255,255,0.03)',
          borderColor: isOnline ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.08)',
        }}
      >
        <div className="flex items-center justify-between p-5">
          <div>
            <p
              className="text-xs uppercase tracking-widest font-semibold mb-1"
              style={{ color: isOnline ? '#10b981' : 'rgba(255,255,255,0.3)' }}
            >
              {isOnline ? '● Online' : '○ Offline'}
            </p>
            <p className="text-white font-semibold text-base">
              {isOnline ? 'Ready for jobs' : 'You are off duty'}
            </p>
            <p className="text-white/40 text-xs mt-0.5">
              {isOnline ? 'Tap to go offline' : 'Tap to go online and receive jobs'}
            </p>
          </div>
          <div
            className="w-14 h-8 rounded-full flex items-center px-1 transition-all duration-300"
            style={{
              background: isOnline ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(255,255,255,0.1)',
            }}
          >
            <div
              className="w-6 h-6 rounded-full bg-white shadow transition-transform duration-300"
              style={{ transform: isOnline ? 'translateX(24px)' : 'translateX(0)' }}
            />
          </div>
        </div>
      </div>

      {/* Active Job Banner */}
      {activeBooking && (
        <Link href={`/jobs/${activeBooking.id}`}>
          <div
            className="mb-5 rounded-2xl border border-[#d5a538]/30 p-4"
            style={{ background: 'linear-gradient(135deg, rgba(213,165,56,0.12), rgba(213,165,56,0.04))' }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[#d5a538]">
                ● Active Job
              </span>
              <ChevronRight size={16} className="text-[#d5a538]" />
            </div>
            <p className="text-white font-semibold text-sm">{activeBooking.customer_name}</p>
            <p className="text-white/50 text-xs mt-0.5">
              {activeBooking.pickup_location ?? activeBooking.airport ?? 'Pickup location'}
            </p>
          </div>
        </Link>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-[#0B1525] border border-white/8 rounded-xl p-3 text-center">
          <Briefcase size={16} className="mx-auto mb-1 text-[#d5a538]" />
          <p className="text-white font-bold text-lg">{upcomingBookings.length + (activeBooking ? 1 : 0)}</p>
          <p className="text-white/30 text-[10px] uppercase tracking-wide mt-0.5">Today</p>
        </div>
        <div className="bg-[#0B1525] border border-white/8 rounded-xl p-3 text-center">
          <Car size={16} className="mx-auto mb-1 text-[#d5a538]" />
          <p className="text-white font-bold text-lg">{completedToday.length}</p>
          <p className="text-white/30 text-[10px] uppercase tracking-wide mt-0.5">Done</p>
        </div>
        <div className="bg-[#0B1525] border border-white/8 rounded-xl p-3 text-center">
          <Star size={16} className="mx-auto mb-1 text-[#d5a538]" />
          <p className="text-white font-bold text-lg">{bookings.length}</p>
          <p className="text-white/30 text-[10px] uppercase tracking-wide mt-0.5">Total</p>
        </div>
      </div>

      {/* Upcoming Jobs */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-white font-semibold text-sm">Today&apos;s Jobs</h2>
        <Link href="/jobs" className="text-[#d5a538] text-xs font-medium">
          View all
        </Link>
      </div>

      {upcomingBookings.length === 0 && !activeBooking ? (
        <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-6 text-center">
          <Car size={28} className="mx-auto mb-2 text-white/20" />
          <p className="text-white/40 text-sm">No upcoming jobs today</p>
        </div>
      ) : (
        <div className="space-y-3">
          {upcomingBookings.slice(0, 3).map((booking) => (
            <Link key={booking.id} href={`/jobs/${booking.id}`}>
              <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4 active:opacity-80 transition-opacity">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-[#d5a538] font-semibold text-sm">{booking.travel_time ?? '—'}</span>
                  <div className="flex items-center gap-2">
                    <BookingStatusBadge status={booking.status} />
                    <ChevronRight size={14} className="text-white/30" />
                  </div>
                </div>
                <p className="text-white font-medium text-sm mb-3">{booking.customer_name}</p>
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] mt-1.5 flex-shrink-0" />
                    <p className="text-white/50 text-xs leading-tight">
                      {booking.pickup_location ?? booking.airport ?? '—'}
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                    <p className="text-white/50 text-xs leading-tight">{booking.dropoff_address ?? '—'}</p>
                  </div>
                </div>
                {booking.quoted_price && (
                  <div className="flex items-center mt-3 pt-3 border-t border-white/5">
                    <span className="ml-auto text-[#d5a538] font-semibold text-sm">
                      £{booking.quoted_price.toFixed(0)}
                    </span>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

    </div>
  )
}
