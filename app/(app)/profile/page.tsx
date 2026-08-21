'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { logout } from '@/app/actions/auth'
import {
  Car, ChevronRight, Phone, Mail, LogOut, Bell,
  HelpCircle, Loader2, ClipboardList, MessageCircle, PoundSterling, Star,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { OPS_PHONE, OPS_WHATSAPP, SUPPORT_EMAIL } from '@/lib/config'
import type { Driver } from '@/lib/types'

export default function ProfilePage() {
  const router = useRouter()
  const [driver, setDriver] = useState<Driver | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [tripCount, setTripCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [togglingOnline, setTogglingOnline] = useState(false)
  const supabase = createClient()

  const loadProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setEmail(user.email ?? null)

    const [driverRes, tripsRes] = await Promise.all([
      supabase.from('drivers').select('*').eq('id', user.id).single(),
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_driver_id', user.id)
        .in('status', ['completed', 'Completed']),
    ])

    if (driverRes.data) setDriver(driverRes.data)
    setTripCount(tripsRes.count ?? 0)
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadProfile() }, [loadProfile])

  const toggleOnline = async () => {
    if (!driver || togglingOnline) return
    const next = !driver.is_online
    setTogglingOnline(true)
    setDriver({ ...driver, is_online: next })
    const { error } = await supabase.from('drivers').update({ is_online: next }).eq('id', driver.id)
    if (error) setDriver({ ...driver, is_online: !next })
    setTogglingOnline(false)
  }

  const initials = driver?.full_name
    ? driver.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2)
    : '?'

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060C1A] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#d5a538]" size={28} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#060C1A] px-4 pt-12 pb-4">
      <h1 className="text-white font-bold text-xl mb-6">Profile</h1>

      {/* Driver card */}
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
              {tripCount > 0 ? `${tripCount} trips completed` : 'No trips yet'}
            </p>
            {driver?.rating != null && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Star
                      key={i}
                      size={12}
                      className={i <= Math.round(driver.rating!) ? 'text-[#d5a538] fill-[#d5a538]' : 'text-white/15'}
                    />
                  ))}
                </div>
                <span className="text-white/70 text-xs font-bold">{(driver.rating as number).toFixed(1)}</span>
                <span className="text-white/25 text-xs">driver rating</span>
              </div>
            )}
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
          {email && (
            <div className="flex items-center gap-2 text-white/50 text-sm">
              <Mail size={14} className="text-white/25" />
              {email}
            </div>
          )}
          {driver?.phone && (
            <div className="flex items-center gap-2 text-white/50 text-sm">
              <Phone size={14} className="text-white/25" />
              {driver.phone}
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${driver?.is_online ? 'bg-[#10b981]' : 'bg-white/20'}`} />
            <div>
              <p className="text-white text-sm font-medium">{driver?.is_online ? 'Online' : 'Offline'}</p>
              <p className="text-white/30 text-[11px]">
                {driver?.is_online ? 'Visible for new job assignments' : 'Not receiving new jobs'}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!!driver?.is_online}
            onClick={toggleOnline}
            disabled={togglingOnline || !driver}
            className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${
              driver?.is_online ? 'bg-[#d5a538]' : 'bg-white/10'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                driver?.is_online ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Vehicle */}
      {(driver?.vehicle_model || driver?.vehicle_registration) && (
        <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Car size={14} className="text-[#d5a538]" />
            <p className="text-white/50 text-xs font-semibold uppercase tracking-widest">Vehicle</p>
          </div>
          <div className="grid grid-cols-2 gap-y-3">
            {driver.vehicle_model && (
              <div>
                <p className="text-white/25 text-[10px] uppercase tracking-wide">Model</p>
                <p className="text-white text-sm font-medium mt-0.5">{driver.vehicle_model}</p>
              </div>
            )}
            {driver.vehicle_registration && (
              <div>
                <p className="text-white/25 text-[10px] uppercase tracking-wide">Registration</p>
                <p className="text-white text-sm font-medium mt-0.5 font-mono">{driver.vehicle_registration}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Menu rows */}
      <div className="bg-[#0B1525] border border-white/8 rounded-2xl overflow-hidden mb-4">
        <button
          onClick={() => router.push('/earnings')}
          className="w-full flex items-center justify-between px-4 py-3.5 border-b border-white/5 active:bg-white/5"
        >
          <div className="flex items-center gap-3">
            <PoundSterling size={16} className="text-white/35" />
            <span className="text-white/80 text-sm">Earnings</span>
          </div>
          <ChevronRight size={15} className="text-white/20" />
        </button>

        <button
          onClick={() => router.push('/earnings?view=report')}
          className="w-full flex items-center justify-between px-4 py-3.5 border-b border-white/5 active:bg-white/5"
        >
          <div className="flex items-center gap-3">
            <ClipboardList size={16} className="text-white/35" />
            <span className="text-white/80 text-sm">Trip History</span>
          </div>
          <div className="flex items-center gap-2">
            {tripCount > 0 && <span className="text-white/25 text-xs">{tripCount} trips</span>}
            <ChevronRight size={15} className="text-white/20" />
          </div>
        </button>

        <button
          onClick={() => router.push('/notifications')}
          className="w-full flex items-center justify-between px-4 py-3.5 border-b border-white/5 active:bg-white/5"
        >
          <div className="flex items-center gap-3">
            <Bell size={16} className="text-white/35" />
            <span className="text-white/80 text-sm">Notifications</span>
          </div>
          <ChevronRight size={15} className="text-white/20" />
        </button>

        <a
          href={`tel:${OPS_PHONE}`}
          className="w-full flex items-center justify-between px-4 py-3.5 border-b border-white/5 active:bg-white/5"
        >
          <div className="flex items-center gap-3">
            <Phone size={16} className="text-[#d5a538]" />
            <span className="text-white/80 text-sm">Call Operations</span>
          </div>
          <span className="text-white/25 text-xs">EV Exec Dispatch</span>
        </a>

        <a
          href={OPS_WHATSAPP}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-between px-4 py-3.5 border-b border-white/5 active:bg-white/5"
        >
          <div className="flex items-center gap-3">
            <MessageCircle size={16} className="text-green-400" />
            <span className="text-white/80 text-sm">WhatsApp Dispatch</span>
          </div>
          <ChevronRight size={15} className="text-white/20" />
        </a>

        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="w-full flex items-center justify-between px-4 py-3.5 active:bg-white/5"
        >
          <div className="flex items-center gap-3">
            <HelpCircle size={16} className="text-white/35" />
            <span className="text-white/80 text-sm">Help &amp; Support</span>
          </div>
          <ChevronRight size={15} className="text-white/20" />
        </a>
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

      <p className="text-center text-white/15 text-xs mt-4">EV Exec Driver v1.0</p>
    </div>
  )
}
