'use client'

// Web push for the Driver App.
//
// iPhones only let a web app ask for notification permission from a tap,
// and only once it has been added to the Home Screen. So permission is never
// requested automatically: enablePush() is called from a button, and
// syncPush() runs on every app open to save this phone's current
// subscription (it can change when the app is re-added or iOS renews it).

import { createClient } from '@/lib/supabase/client'
import { VAPID_PUBLIC_KEY } from '@/lib/config'

export type PushState =
  | 'unsupported'   // browser has no web push
  | 'needs-install' // iPhone/iPad in Safari: add to Home Screen first
  | 'denied'        // blocked in the phone's settings
  | 'off'           // not asked yet
  | 'on'

const PUSH_KEY_STORAGE = 'evexec_vapid_key'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function pushState(): PushState {
  if (typeof window === 'undefined') return 'unsupported'
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (isIos() && !isStandalone()) return 'needs-install'
  if (!supported) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission === 'granted') return 'on'
  return 'off'
}

async function currentSubscription(): Promise<PushSubscription> {
  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()

  // A subscription made with an older VAPID key is rejected by Apple/Google.
  const storedKey = localStorage.getItem(PUSH_KEY_STORAGE)
  if (existing && storedKey === VAPID_PUBLIC_KEY) return existing
  if (existing) await existing.unsubscribe()

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as ArrayBuffer,
  })
  localStorage.setItem(PUSH_KEY_STORAGE, VAPID_PUBLIC_KEY)
  return sub
}

async function saveSubscription(userId: string, sub: PushSubscription): Promise<void> {
  const json = sub.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('Incomplete subscription')
  const { error } = await createClient().from('push_subscriptions').upsert({
    driver_id: userId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth_key: json.keys.auth,
  }, { onConflict: 'driver_id,endpoint' })
  if (error) throw error
}

/** Saves this phone's subscription if permission is already granted. Safe to call on every app open. */
export async function syncPush(userId: string): Promise<boolean> {
  if (pushState() !== 'on') return false
  try {
    await saveSubscription(userId, await currentSubscription())
    return true
  } catch {
    return false
  }
}

/** Must be called from a tap. Asks for permission, then subscribes and saves. */
export async function enablePush(userId: string): Promise<PushState> {
  const state = pushState()
  if (state === 'unsupported' || state === 'needs-install' || state === 'denied') return state
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return pushState()
  await saveSubscription(userId, await currentSubscription())
  return 'on'
}

/** Sends a test notification to this driver's own registered phones. */
export async function sendTestPush(): Promise<{ sent: number; total: number }> {
  const { data, error } = await createClient().functions.invoke('driver-test-push', { body: {} })
  if (error) throw error
  return data as { sent: number; total: number }
}
