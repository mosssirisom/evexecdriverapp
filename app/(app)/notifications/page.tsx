'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, Bell } from 'lucide-react'

export default function NotificationsPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-[#020813] px-4 pt-12 pb-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-white/40 active:text-white/70">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-white font-bold text-xl">Notifications</h1>
      </div>

      <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-12 text-center">
        <Bell size={32} className="mx-auto mb-3 text-white/20" />
        <p className="text-white/40 text-sm">No notifications</p>
        <p className="text-white/20 text-xs mt-1">You're all caught up</p>
      </div>
    </div>
  )
}
