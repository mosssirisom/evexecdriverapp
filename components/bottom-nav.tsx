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
    <nav className="fixed bottom-0 left-0 right-0 bg-[#0B1525] border-t border-white/8 z-50">
      <div className="flex items-center justify-around pb-safe">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-1 py-3 px-1.5 transition-colors ${
                active ? 'text-[#d5a538]' : 'text-white/30 hover:text-white/60'
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              <span className="text-[9px] font-medium tracking-wide">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
