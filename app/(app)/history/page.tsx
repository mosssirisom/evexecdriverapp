'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, MapPin, Loader2, ClipboardList } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Booking } from '@/lib/types'

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function HistoryPage() {
  const router = useRouter()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [totalEarnings, setTotalEarnings] = useState(0)
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('bookings')
      .select('*')
      .eq('assigned_driver_id', user.id)
      .eq('status', 'completed')
      .order('travel_date', { ascending: false })
      .order('travel_time', { ascending: false })

    if (data) {
      setBookings(data)
      setTotalEarnings(data.reduce((sum, b) => sum + (b.quoted_price ?? 0), 0))
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  return (
    <div className="min-h-screen bg-[#020813] px-4 pt-12 pb-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-white/40 active:text-white/70">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-white font-bold text-xl">Trip History</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-[#d5a538]" size={28} />
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4">
              <p className="text-white/30 text-[10px] uppercase tracking-wide">Total Trips</p>
              <p className="text-white font-bold text-2xl mt-1">{bookings.length}</p>
            </div>
            <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-4">
              <p className="text-white/30 text-[10px] uppercase tracking-wide">Total Earned</p>
              <p className="text-[#d5a538] font-bold text-2xl mt-1">£{totalEarnings.toFixed(2)}</p>
            </div>
          </div>

          {bookings.length === 0 ? (
            <div className="bg-[#0B1525] border border-white/8 rounded-2xl p-12 text-center">
              <ClipboardList size={32} className="mx-auto mb-3 text-white/20" />
              <p className="text-white/40 text-sm">No completed trips yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {bookings.map((job) => {
                const pickup = job.pickup_location ?? job.airport ?? '—'
                const dropoff = job.dropoff_address ?? '—'
                return (
                  <div key={job.id} className="bg-[#0B1525] border border-white/8 rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <p className="text-white font-semibold text-sm">{job.customer_name}</p>
                        <p className="text-white/30 text-xs mt-0.5">
                          {formatDate(job.travel_date)}{job.travel_time ? ` · ${job.travel_time}` : ''}
                        </p>
                      </div>
                      {job.quoted_price != null && (
                        <span className="text-[#d5a538] font-bold text-base flex-shrink-0">
                          £{job.quoted_price.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] flex-shrink-0" />
                        <p className="text-white/50 text-xs truncate">{pickup}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin size={8} className="text-red-400 flex-shrink-0 ml-[1px]" />
                        <p className="text-white/50 text-xs truncate">{dropoff}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
