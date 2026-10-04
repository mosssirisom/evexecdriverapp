const CACHE = 'evexec-driver-v1'

self.addEventListener('install', () => { self.skipWaiting() })

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// Network-first, cache fallback
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  if (!event.request.url.startsWith(self.location.origin)) return
  if (event.request.url.includes('supabase.co')) return

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put(event.request, clone))
        }
        return res
      })
      .catch(() => caches.match(event.request))
  )
})

// Show push notification. Each job + message gets its own tag, so a new
// notification no longer replaces an unrelated one still on the lock screen
// (a repeat of the same message for the same job still replaces itself).
self.addEventListener('push', (event) => {
  // Always show something: iOS cancels the subscription of an app that
  // receives pushes without displaying a notification.
  let data = {}
  try { data = event.data?.json() ?? {} } catch { data = { body: event.data?.text() } }
  const tag = data.tag ?? `${data.url ?? '/jobs'}|${data.title ?? ''}`
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'EV Exec Driver', {
      body: data.body ?? 'You have an update',
      icon: '/logo.png',
      badge: '/logo.png',
      vibrate: [200, 100, 200],
      tag,
      renotify: true,
      data: { url: data.url ?? '/jobs' },
    })
  )
})

// Open app on notification tap
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/jobs'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      const open = cs.find((c) => c.url.includes(self.location.origin))
      if (open) { open.navigate(url); return open.focus() }
      return clients.openWindow(url)
    })
  )
})
