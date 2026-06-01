'use client'

import { useEffect, useState, useCallback } from 'react'
import { logout } from '@/app/actions/auth'
import {
  Car,
  Shield,
  ChevronRight,
  Phone,
  Mail,
  LogOut,
  Bell,
  HelpCircle,
  Loader2,
  ClipboardList,
  MapPin,
  Star,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Driver, Booking } from '@/lib/types'

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function ProfilePage() {
  const [driver, setDriver] = useState<Driver | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [completedJobs, setCompletedJobs] = useState<Booking[]>([])
  const [totalEarnings, setTotalEarnings] = useState(0)
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  const loadProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setEmail(user.email ?? null)

    const [driverRes, jobsRes] = await Promise.all([
      supabase.from('drivers').select('*').eq('id', user.id).single(),
      supabase
        .from('bookings')
        .select('*')
        .eq('assigned_driver_id', user.id)
        .eq('status', 'completed')
        .order('travel_date', { ascending: false })
        .order('travel_time', { ascending: false })
        .limit(20),
    ])

    if (driverRes.data) setDriver(driverRes.data)
    if (jobsRes.data) {
      setCompletedJobs(jobsRes.data)
      const total = jobsRes.data.reduce((sum, b) => sum + (b.quoted_price ?? 0), 0)
      setTotalEarnings(total)
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadProfile() }, [loadProfile])

  const initials = driver?.full_name
    ? driver.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2)
    : '?'

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020813] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#d5a538]" size={28} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#020813] px-4 pt-12 pb-4">
      <h1 className="text-white font-bold text-xl mb-6">Profile</h1>

      {/* Driver Card */}
      <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-5 mb-4">
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold text-[#020813] flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)' }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-bold text-lg">{driver?.full_name ?? 'Driver'}</h2>
            <p className="text-white/40 text-xs mt-0.5">
              {driver?.is_online ? '● Online' : '○ Offline'}
            </p>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
          {email && (
            <div className="flex items-center gap-2 text-white/50 text-sm">
              <Mail size={14} className="text-white/30" />
              {email}
            </div>
          )}
          {driver?.phone && (
            <div className="flex items-center gap-2 text-white/50 text-sm">
              <Phone size={14} className="text-white/30" />
              {driver.phone}
            </div>
          )}
        </div>
      </div>

      {/* Vehicle */}
      {(driver?.vehicle_model || driver?.vehicle_registration) && (
        <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Car size={14} className="text-[#d5a538]" />
            <p className="text-white/60 text-xs font-semibold uppercase tracking-widest">Vehicle</p>
          </div>
          <div className="grid grid-cols-2 gap-y-3 gap-x-4">
            {driver.vehicle_model && (
              <div>
                <p className="text-white/30 text-[10px] uppercase tracking-wide">Model</p>
                <p className="text-white text-sm font-medium mt-0.5">{driver.vehicle_model}</p>
              </div>
            )}
            {driver.vehicle_registration && (
              <div>
                <p className="text-white/30 text-[10px] uppercase tracking-wide">Registration</p>
                <p className="text-white text-sm font-medium mt-0.5 font-mono">{driver.vehicle_registration}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Documents placeholder */}
      <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-[#d5a538]" />
          <p className="text-white/60 text-xs font-semibold uppercase tracking-widest">Documents</p>
        </div>
        <p className="text-white/30 text-xs mt-2">Managed by EV Exec Operations</p>
      </div>

      {/* Completed Jobs */}
      <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ClipboardList size={14} className="text-[#d5a538]" />
            <p className="text-white/60 text-xs font-semibold uppercase tracking-widest">Trip History</p>
          </div>
          <span className="text-white/30 text-xs">{completedJobs.length} jobs</span>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white/3 rounded-xl p-3">
            <p className="text-white/30 text-[10px] uppercase tracking-wide">Total Trips</p>
            <p className="text-white font-bold text-lg mt-0.5">{completedJobs.length}</p>
          </div>
          <div className="bg-white/3 rounded-xl p-3">
            <p className="text-white/30 text-[10px] uppercase tracking-wide">Total Earned</p>
            <p className="text-[#d5a538] font-bold text-lg mt-0.5">
              £{totalEarnings.toFixed(2)}
            </p>
          </div>
        </div>

        {completedJobs.length === 0 ? (
          <div className="py-6 text-center">
            <Star size={24} className="mx-auto mb-2 text-white/15" />
            <p className="text-white/30 text-xs">No completed trips yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {completedJobs.map((job) => {
              const pickup = job.pickup_location ?? job.airport ?? '—'
              const dropoff = job.dropoff_address ?? '—'
              return (
                <div
                  key={job.id}
                  className="bg-white/3 rounded-xl p-3"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-semibold truncate">{job.customer_name}</p>
                      <p className="text-white/30 text-[10px] mt-0.5">{formatDate(job.travel_date)}{job.travel_time ? ` · ${job.travel_time}` : ''}</p>
                    </div>
                    {job.quoted_price != null && (
                      <span className="text-[#d5a538] font-bold text-sm flex-shrink-0">
                        £{job.quoted_price.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] flex-shrink-0" />
                      <p className="text-white/40 text-[10px] truncate">{pickup}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin size={6} className="text-red-400 flex-shrink-0 ml-[1px]" />
                      <p className="text-white/40 text-[10px] truncate">{dropoff}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Settings */}
      <div className="bg-[#0B1525] border border-white/8 rounded-2xl overflow-hidden mb-4">
        {[
          { icon: Bell, label: 'Notifications' },
          { icon: HelpCircle, label: 'Help & Support' },
        ].map(({ icon: Icon, label }) => (
          <button
            key={label}
            className="w-full flex items-center justify-between px-4 py-3.5 border-b border-white/5 last:border-0 active:bg-white/5"
          >
            <div className="flex items-center gap-3">
              <Icon size={16} className="text-white/40" />
              <span className="text-white/80 text-sm">{label}</span>
            </div>
            <ChevronRight size={15} className="text-white/20" />
          </button>
        ))}
      </div>

      {/* Logout */}
      <form action={logout}>
        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-red-500/25 text-red-400 text-sm font-semibold bg-red-500/8 active:opacity-70 transition-opacity"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </form>

      <p className="text-center text-white/15 text-xs mt-4">EV Exec Driver v0.2.0</p>
    </div>
  )
}
