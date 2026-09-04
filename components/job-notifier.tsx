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

const PUSH_KEY_STORAGE = 'evexec_vapid_key'

async function registerPush(userId: string) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  try {
    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()

    // If the stored VAPID key differs from the current one, the existing
    // subscription is bound to the old key and will be rejected by Apple/Chrome.
    // Unsubscribe so we get a fresh one tied to the current key.
    const storedKey = localStorage.getItem(PUSH_KEY_STORAGE)
    if (existing && storedKey !== VAPID_PUBLIC_KEY) {
      await existing.unsubscribe()
    }

    const sub = (storedKey === VAPID_PUBLIC_KEY ? existing : null) ??
      await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as ArrayBuffer,
      })

    const json = sub.toJSON()
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return

    localStorage.setItem(PUSH_KEY_STORAGE, VAPID_PUBLIC_KEY)

    const supabase = createClient()
    await supabase.from('push_subscriptions').upsert({
      driver_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth_key: json.keys.auth,
    }, { onConflict: 'driver_id,endpoint', ignoreDuplicates: true })
  } catch { /* permission denied or unsupported */ }
}

const CANCELLED_STATUSES = new Set(['cancelled', 'Cancelled', 'canceled', 'Canceled', 'No Show', 'no show'])
const DETAIL_FIELDS = ['travel_date', 'travel_time', 'pickup_location', 'airport', 'dropoff_address'] as const

type BookingRow = Record<string, string | number | boolean | null>
type DriverEventRow = { event_type: string; payload: Record<string, string | null> | null }

function showNativeNotification(title: string, body: string, tag: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/logo.png', tag })
  }
}

export function JobNotifier() {
  const supabase = createClient()
  const { addToast } = useToast()
  const askedRef = useRef(false)

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    let eventsChannel: ReturnType<typeof supabase.channel> | null = null

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
        .channel('driver-job-events')
        // New job assigned
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'bookings', filter: `assigned_driver_id=eq.${user.id}` },
          (payload) => {
            const b = payload.new as BookingRow
            const pickup = (b.pickup_location ?? b.airport ?? 'See job details') as string
            const customer = (b.customer_name ?? 'New booking') as string
            const msg = `${pickup}${b.travel_date ? ` · ${b.travel_date}` : ''}`
            addToast({ title: `New job — ${customer}`, message: msg, href: `/jobs/${b.id}` })
            showNativeNotification(`New job — ${customer}`, `${customer} · ${pickup}`, 'new-job')
          }
        )
        // Job updated or cancelled
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `assigned_driver_id=eq.${user.id}` },
          (payload) => {
            const b = payload.new as BookingRow
            const old = payload.old as BookingRow
            const customer = (b.customer_name ?? 'Your booking') as string
            const ref = (b.ref ?? String(b.id).slice(0, 8).toUpperCase()) as string

            const isCancelled = CANCELLED_STATUSES.has(b.status as string)
              && !CANCELLED_STATUSES.has(old.status as string)

            if (isCancelled) {
              addToast({
                title: `Job cancelled — ${ref}`,
                message: `Booking for ${customer} has been cancelled.`,
                href: `/jobs/${b.id}`,
              })
              showNativeNotification(
                `Job cancelled — ${ref}`,
                `Booking for ${customer} has been cancelled.`,
                `cancelled-${b.id}`
              )
              return
            }

            const changed = DETAIL_FIELDS.filter(f => b[f] !== old[f])
            if (changed.length > 0 && !isCancelled) {
              addToast({
                title: `Job updated — ${ref}`,
                message: `${customer} · Details have changed. Tap to view.`,
                href: `/jobs/${b.id}`,
              })
              showNativeNotification(
                `Job updated — ${ref}`,
                `${customer} · Journey details have changed.`,
                `updated-${b.id}`
              )
            }
          }
        )
        .subscribe()

      // Unassignment detection — the DB trigger trg_notify_driver_unassigned
      // writes a row to driver_events when this driver is removed from a booking.
      // Filtered subscription means only this driver's own events are delivered.
      eventsChannel = supabase
        .channel('driver-events')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'driver_events',
            filter: `driver_id=eq.${user.id}`,
          },
          (payload) => {
            const ev = payload.new as DriverEventRow
            if (ev.event_type !== 'booking_unassigned') return
            const p = ev.payload ?? {}
            const ref = (p.ref ?? String(p.booking_id ?? '').slice(0, 8).toUpperCase())
            const customer = p.customer_name ?? 'A booking'
            addToast({
              title: `Job removed — ${ref}`,
              message: `${customer} has been removed from your schedule.`,
            })
            showNativeNotification(
              `Job removed — ${ref}`,
              `${customer} has been removed from your schedule.`,
              `unassigned-${p.booking_id}`
            )
          }
        )
        .subscribe()
    }

    setup()
    return () => {
      if (channel) supabase.removeChannel(channel)
      if (eventsChannel) supabase.removeChannel(eventsChannel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
