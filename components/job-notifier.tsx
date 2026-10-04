'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { syncPush } from '@/lib/push'
import { useToast } from './toast'

const CANCELLED_STATUSES = new Set(['cancelled', 'Cancelled', 'canceled', 'Canceled', 'No Show', 'no show'])
const DETAIL_FIELDS = [
  'travel_date', 'travel_time', 'pickup_location', 'airport', 'dropoff_address',
  'quoted_price', 'payment_method', 'payment_status',
] as const

type BookingRow = Record<string, string | number | boolean | null>
type DriverEventRow = { event_type: string; payload: Record<string, string | null> | null }

function showNativeNotification(title: string, body: string, tag: string) {
  // Only while the app is hidden: when it's on screen the toast is enough.
  // `new Notification()` throws on iPhones, so go through the service worker.
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible') return
  navigator.serviceWorker?.ready
    .then((reg) => reg.showNotification(title, { body, icon: '/logo.png', tag }))
    .catch(() => {})
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

      // Save this phone's current push subscription. Permission itself is only
      // ever asked for from a tap (PushPrompt / Profile), as iPhones require.
      if (!askedRef.current) {
        askedRef.current = true
        await syncPush(user.id)
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
        // Job updated, status changed, or cancelled
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

            // Detail or payment field changes
            const changed = DETAIL_FIELDS.filter(f => b[f] !== old[f])
            if (changed.length > 0) {
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
