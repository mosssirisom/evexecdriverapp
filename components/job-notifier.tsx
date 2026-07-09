'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { VAPID_PUBLIC_KEY } from '@/lib/config'
import { useToast } from './toast'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

async function registerPush(userId: string) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  try {
    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as ArrayBuffer,
    })
    const json = sub.toJSON()
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return

    const supabase = createClient()
    await supabase.from('push_subscriptions').upsert({
      driver_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth_key: json.keys.auth,
    }, { onConflict: 'driver_id,endpoint', ignoreDuplicates: true })
  } catch { /* permission denied or unsupported */ }
}

type NewJobPayload = { customer_name: string; pickup_location?: string; airport?: string; travel_date?: string }

function notifyNewJob(b: NewJobPayload, addToast: ReturnType<typeof useToast>['addToast']) {
  const pickup = b.pickup_location ?? b.airport ?? 'See job details'
  const msg = `${pickup}${b.travel_date ? ` · ${b.travel_date}` : ''}`

  addToast({ title: `New job — ${b.customer_name}`, message: msg, href: '/jobs' })

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('New job assigned — EV Exec', {
      body: `${b.customer_name} · ${pickup}`,
      icon: '/logo.png',
      tag: 'new-job',
    })
  }
}

export function JobNotifier() {
  const supabase = createClient()
  const { addToast } = useToast()
  const askedRef = useRef(false)

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    const setup = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Ask for browser notification permission once, then register push
      if (!askedRef.current && 'Notification' in window && Notification.permission === 'default') {
        askedRef.current = true
        const perm = await Notification.requestPermission()
        if (perm === 'granted') await registerPush(user.id)
      } else if (!askedRef.current && Notification.permission === 'granted') {
        askedRef.current = true
        await registerPush(user.id)
      }

      channel = supabase
        .channel('driver-new-jobs')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'bookings', filter: `assigned_driver_id=eq.${user.id}` },
          (payload) => notifyNewJob(payload.new as NewJobPayload, addToast)
        )
        .on(
          // The real dispatch flow assigns a driver by UPDATEing an existing
          // unassigned booking, not by INSERTing a new one — without this,
          // drivers were never notified when actually dispatched a job.
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `assigned_driver_id=eq.${user.id}` },
          (payload) => {
            const oldAssigned = (payload.old as { assigned_driver_id?: string | null } | null)?.assigned_driver_id
            if (oldAssigned === user.id) return // already assigned to this driver — some other field changed
            notifyNewJob(payload.new as NewJobPayload, addToast)
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
