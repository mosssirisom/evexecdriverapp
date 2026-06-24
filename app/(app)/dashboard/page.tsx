'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Car, ChevronRight, Bell, Briefcase, Star, RefreshCw, Battery, CheckCircle2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BookingStatusBadge } from '@/components/badges'
import { PickupIcon, DropoffIcon } from '@/components/route-icons'
import { formatTime } from '@/lib/format'
import type { Booking, Driver } from '@/lib/types'

type AttestBooking = Pick<Booking, 'id' | 'ref' | 'customer_name' | 'travel_date' | 'travel_time' | 'pickup_location' | 'airport' | 'attestation_status'>

export default function DashboardPage() {
  const [driver, setDriver] = useState<Driver | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [attestationBookings, setAttestationBookings] = useState<AttestBooking[]>([])
  const [confirmingJobId, setConfirmingJobId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const supabase = createClient()

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: driverData }, { data: bookingData }, { data: attestData }] = await Promise.all([
      supabase.from('drivers').select('*').eq('id', user.id).single(),
      supabase
        .from('bookings')
        .select('*')
        .eq('assigned_driver_id', user.id)
        .in('status', ['accepted', 'confirmed', 'Dispatched', 'En Route', 'en_route', 'Passenger On Board', 'Arrived', 'arrived', 'Active', 'active'])
        .order('travel_date', { ascending: true })
        .order('travel_time', { ascending: true }),
      supabase
        .from('bookings')
        .select('id, ref, customer_name, travel_date, travel_time, pickup_location, airport, attestation_status')
        .eq('assigned_driver_id', user.id)
        .in('attestation_status', ['awaiting_first_attestation', 'awaiting_second_attestation'])
        .is('driver_confirmed_at', null),
    ])

    if (driverData) setDriver(driverData)
    if (bookingData) setBookings(bookingData)
    if (attestData) setAttestationBookings(attestData as AttestBooking[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  // Live updates when operator assigns or changes bookings
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      channel = supabase
        .channel('dashboard-live')
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'bookings',
          filter: `assigned_driver_id=eq.${user.id}`,
        }, () => loadData())
        .subscribe()
    })
    return () => { if (channel) supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const today = new Date().toISOString().split('T')[0]
  const todayBookings = bookings.filter((b) => b.travel_date === today)
  const activeBooking = bookings.find((b) => ['En Route', 'en_route', 'Passenger On Board', 'Arrived', 'arrived', 'Active', 'active'].includes(b.status))
  const upcomingBookings = todayBookings.filter((b) => ['accepted', 'confirmed', 'Dispatched'].includes(b.status))
  const completedToday = bookings.filter((b) => ['completed', 'Completed'].includes(b.status) && b.travel_date === today)

  const initials = driver?.full_name
    ? driver.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2)
    : '?'

  const confirmJob = async (bookingId: string) => {
    setConfirmingJobId(bookingId)
    await supabase.from('bookings').update({
      driver_confirmed_at: new Date().toISOString(),
      attestation_status: 'confirmed',
    }).eq('id', bookingId)
    setAttestationBookings(prev => prev.filter(b => b.id !== bookingId))
    setConfirmingJobId(null)
  }

  const adjustBattery = async (delta: number) => {
    if (!driver) return
    const next = Math.min(100, Math.max(0, (driver.battery_percent ?? 50) + delta))
    setDriver({ ...driver, battery_percent: next })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('drivers').update({ battery_percent: next }).eq('id', user.id)
  }

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
          <button
            onClick={async () => { setRefreshing(true); await loadData(); setRefreshing(false) }}
            disabled={refreshing}
            className="w-10 h-10 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center active:opacity-70 disabled:opacity-50"
          >
            <RefreshCw size={16} className={`text-white/60 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <Link
            href="/notifications"
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

      {/* Attestation — jobs needing driver confirmation */}
      {attestationBookings.length > 0 && (
        <div className="mb-5 space-y-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-400">
            ⚠ Confirmation Required
          </p>
          {attestationBookings.map(b => (
            <div
              key={b.id}
              className="bg-[#0B1525] border border-amber-500/30 rounded-2xl p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm">{b.customer_name}</p>
                  <p className="text-white/40 text-xs mt-0.5">
                    {b.travel_date ?? ''}
                    {b.travel_time ? ` · ${formatTime(b.travel_time)}` : ''}
                  </p>
                  <p className="text-white/40 text-xs mt-0.5 truncate">
                    {b.pickup_location ?? b.airport ?? '—'}
                  </p>
                </div>
                <button
                  onClick={() => confirmJob(b.id)}
                  disabled={confirmingJobId === b.id}
                  className="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-bold text-[#020813] disabled:opacity-50 flex items-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg, #f1c56a, #d5a538)' }}
                >
                  {confirmingJobId === b.id
                    ? <Loader2 size={14} className="animate-spin" />
                    : <CheckCircle2 size={14} />}
                  Confirm
                </button>
              </div>
              <div className="mt-2.5">
                <span className="text-[10px] font-semibold px-2 py-1 rounded-full text-amber-400 bg-amber-500/10 border border-amber-500/20">
                  {b.attestation_status === 'awaiting_second_attestation'
                    ? '2nd confirmation'
                    : '1st confirmation'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

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

      {/* EV Battery widget */}
      {driver && (
        <div className="bg-[#0B1525] border border-white/8 rounded-2xl px-4 py-3 mb-5">
          <div className="flex items-center gap-3">
            <Battery
              size={16}
              className={
                (driver.battery_percent ?? 0) > 50
                  ? 'text-green-400'
                  : (driver.battery_percent ?? 0) > 25
                    ? 'text-amber-400'
                    : 'text-red-400'
              }
            />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <p className="text-white/30 text-[10px] uppercase tracking-widest">EV Battery</p>
                <span
                  className="text-xs font-bold"
                  style={{
                    color:
                      (driver.battery_percent ?? 0) > 50
                        ? '#10b981'
                        : (driver.battery_percent ?? 0) > 25
                          ? '#f59e0b'
                          : '#ef4444',
                  }}
                >
                  {driver.battery_percent != null ? `${driver.battery_percent}%` : '—'}
                </span>
              </div>
              <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${driver.battery_percent ?? 0}%`,
                    background:
                      (driver.battery_percent ?? 0) > 50
                        ? '#10b981'
                        : (driver.battery_percent ?? 0) > 25
                          ? '#f59e0b'
                          : '#ef4444',
                  }}
                />
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => adjustBattery(-5)}
                className="w-7 h-7 rounded-lg bg-white/8 border border-white/10 text-white/60 text-sm font-bold flex items-center justify-center active:opacity-70"
              >
                −
              </button>
              <button
                onClick={() => adjustBattery(5)}
                className="w-7 h-7 rounded-lg bg-white/8 border border-white/10 text-white/60 text-sm font-bold flex items-center justify-center active:opacity-70"
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}

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
                  <span className="text-[#d5a538] font-semibold text-sm">{formatTime(booking.travel_time)}</span>
                  <div className="flex items-center gap-2">
                    <BookingStatusBadge status={booking.status} />
                    <ChevronRight size={14} className="text-white/30" />
                  </div>
                </div>
                <p className="text-white font-medium text-sm mb-3">{booking.customer_name}</p>
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5">
                      <PickupIcon booking={booking} size={13} />
                    </div>
                    <p className="text-white/50 text-xs leading-tight">
                      {booking.pickup_location ?? booking.airport ?? '—'}
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5">
                      <DropoffIcon size={13} />
                    </div>
                    <p className="text-white/50 text-xs leading-tight">{booking.dropoff_address ?? booking.airport ?? '—'}</p>
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
