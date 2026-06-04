'use client'

import { usePathname } from 'next/navigation'
import { BottomNav } from '@/components/bottom-nav'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isJobDetail = /^\/jobs\/[^/]+/.test(pathname)

  return (
    <div className={`min-h-screen bg-[#020813] ${isJobDetail ? '' : 'pb-20'}`}>
      {children}
      <BottomNav />
    </div>
  )
}
