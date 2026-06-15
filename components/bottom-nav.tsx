'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, ClipboardList, CalendarDays, User } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/jobs', label: 'Jobs', icon: ClipboardList },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/profile', label: 'Me', icon: User },
]

export function BottomNav() {
  const pathname = usePathname()

  // Hide nav on job detail pages to maximise driving screen space
  if (/^\/jobs\/[^/]+/.test(pathname)) return null

  return (
    <nav className="fixed bottom-4 left-3 right-3 bg-[#0B1525] border border-white/10 rounded-[28px] shadow-2xl shadow-black/40 z-50">
      <div className="flex h-[78px] items-center justify-around px-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={`flex min-h-[62px] min-w-[64px] flex-col items-center justify-center gap-1.5 rounded-2xl px-2 transition-colors ${
                active ? 'text-[#d5a538]' : 'text-white/35 hover:text-white/65'
              }`}
            >
              <Icon size={24} strokeWidth={active ? 2.5 : 1.9} />
              <span className="text-[10.5px] font-medium tracking-wide">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
