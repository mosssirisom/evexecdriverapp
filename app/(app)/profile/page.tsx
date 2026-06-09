'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { logout } from '@/app/actions/auth'
import {
  Car, Shield, ChevronRight, Phone, Mail, LogOut, Bell,
  HelpCircle, Loader2, ClipboardList, MessageCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getDriverByEmail } from '@/lib/getDriver'
import { OPS_PHONE, OPS_WHATSAPP, SUPPORT_EMAIL } from '@/lib/config'
import type { Driver } from '@/lib/types'

export default function ProfilePage() {
  const router = useRouter()
  const [driver, setDriver] = useState<Driver | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [tripCount, setTripCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  const loadProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return
    setEmail(user.email)

    const driverData = await getDriverByEmail(supabase, user.email)
    if (driverData) {
      setDriver(driverData as unknown as Driver)

      const { count } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_driver_id', driverData.id)
        .in('status', ['completed', 'Completed'])

      setTripCount(count ?? 0)
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadProfile() }, [loadProfile])

  const initials = driver?.name
    ? driver.name.split(' ').map((n) => n[0]).join('').slice(0, 2)
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
            <h2 className="text-white font-bold text-lg">{driver?.name ?? 'Driver'}</h2>
            <p className="text-white/40 text-xs mt-0.5">
              {tripCount > 0 ? `${tripCount} trips completed` : 'No trips yet'}
            </p>
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
      </div>

      {/* Vehicle */}
      {(driver?.vehicle || driver?.plate) && (
        <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Car size={14} className="text-[#d5a538]" />
            <p className="text-white/50 text-xs font-semibold uppercase tracking-widest">Vehicle</p>
          </div>
          <div className="grid grid-cols-2 gap-y-3">
            {driver.vehicle && (
              <div>
                <p className="text-white/25 text-[10px] uppercase tracking-wide">Model</p>
                <p className="text-white text-sm font-medium mt-0.5">{driver.vehicle}</p>
              </div>
            )}
            {driver.plate && (
              <div>
                <p className="text-white/25 text-[10px] uppercase tracking-wide">Registration</p>
                <p className="text-white text-sm font-medium mt-0.5 font-mono">{driver.plate}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Documents */}
      <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-[#d5a538]" />
          <p className="text-white/50 text-xs font-semibold uppercase tracking-widest">Documents</p>
        </div>
        <p className="text-white/25 text-xs mt-2">Managed by EV Exec Operations</p>
      </div>

      {/* Menu rows */}
      <div className="bg-[#0B1525] border border-white/8 rounded-2xl overflow-hidden mb-4">
        <button
          onClick={() => router.push('/history')}
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
