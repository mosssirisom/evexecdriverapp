'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Home, ClipboardList, CalendarDays, MessageSquare, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

function useUnreadMessages() {
  const [count, setCount] = useState(0)
  const supabase = createClient()

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    const fetchCount = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { count: c } = await supabase
        .from('driver_messages')
        .select('id', { count: 'exact', head: true })
        .eq('driver_id', user.id)
        .eq('from_driver', false)
        .is('read_at', null)
      setCount(c ?? 0)

      if (!channel) {
        channel = supabase
          .channel('nav-unread')
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'driver_messages',
            filter: `driver_id=eq.${user.id}`,
          }, fetchCount)
          .subscribe()
      }
    }

    fetchCount()
    return () => { if (channel) supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return count
}

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/jobs', label: 'Jobs', icon: ClipboardList },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/profile', label: 'Me', icon: User },
]

export function BottomNav() {
  const pathname = usePathname()
  const unread = useUnreadMessages()

  if (/^\/jobs\/[^/]+/.test(pathname)) return null

  return (
    <nav className="fixed bottom-4 left-3 right-3 bg-[#0B1525] border border-white/10 rounded-[28px] shadow-2xl shadow-black/40 z-50">
      <div className="flex h-[78px] items-center justify-around px-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          const isChat = href === '/chat'
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex min-h-[62px] min-w-[56px] flex-col items-center justify-center gap-1.5 rounded-2xl px-2 transition-colors ${
                active ? 'text-[#d5a538]' : 'text-white/35 hover:text-white/65'
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.9} />
              {isChat && unread > 0 && (
                <span className="absolute top-2.5 right-2 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
              <span className="text-[10px] font-medium tracking-wide">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
