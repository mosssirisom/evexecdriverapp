// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/config', () => ({ VAPID_PUBLIC_KEY: 'k' }))

import { pushState } from './push'

type Env = { ua?: string; standalone?: boolean; sw?: boolean; pm?: boolean; notif?: NotificationPermission | null }
const setup = ({ ua = 'Mozilla/5.0 (Linux; Android 14)', standalone = false, sw = true, pm = true, notif = 'default' }: Env) => {
  vi.stubGlobal('navigator', {
    userAgent: ua, platform: 'Linux', maxTouchPoints: 5,
    ...(sw ? { serviceWorker: {} } : {}),
  })
  vi.stubGlobal('matchMedia', () => ({ matches: standalone }))
  if (pm) vi.stubGlobal('PushManager', class {}); else delete (window as unknown as Record<string, unknown>).PushManager
  if (notif) vi.stubGlobal('Notification', { permission: notif }); else delete (window as unknown as Record<string, unknown>).Notification
}
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'

afterEach(() => vi.unstubAllGlobals())

describe('pushState', () => {
  it('iPhone in Safari must add the app to the Home Screen first', () => {
    setup({ ua: IPHONE })
    expect(pushState()).toBe('needs-install')
  })
  it('iPhone from the Home Screen can ask', () => {
    setup({ ua: IPHONE, standalone: true })
    expect(pushState()).toBe('off')
  })
  it('a browser without web push is unsupported', () => {
    setup({ pm: false })
    expect(pushState()).toBe('unsupported')
    setup({ sw: false })
    expect(pushState()).toBe('unsupported')
    setup({ notif: null })
    expect(pushState()).toBe('unsupported')
  })
  it('follows the notification permission', () => {
    setup({ notif: 'default' }); expect(pushState()).toBe('off')
    setup({ notif: 'granted' }); expect(pushState()).toBe('on')
    setup({ notif: 'denied' }); expect(pushState()).toBe('denied')
  })
})
