'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from './toast'

export function JobNotifier() {
  const supabase = createClient()
  const { addToast } = useToast()
  const askedRef = useRef(false)

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    const setup = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Ask for browser notification permission once
      if (!askedRef.current && 'Notification' in window && Notification.permission === 'default') {
        askedRef.current = true
        await Notification.requestPermission()
      }

      channel = supabase
        .channel('driver-new-jobs')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'bookings', filter: `assigned_driver_id=eq.${user.id}` },
          (payload) => {
            const b = payload.new as { customer_name: string; pickup_location?: string; airport?: string; travel_date?: string }
            const pickup = b.pickup_location ?? b.airport ?? 'See job details'
            const msg = `${pickup}${b.travel_date ? ` · ${b.travel_date}` : ''}`

            addToast({ title: `New job — ${b.customer_name}`, message: msg, href: '/jobs' })

            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('New job assigned — EV Exec', {
                body: `${b.customer_name} · ${pickup}`,
                icon: '/logo.png',
                tag: 'new-job',
                renotify: true,
              })
            }
          }
        )
        .subscribe()
    }

    setup()
    return () => { if (channel) supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
