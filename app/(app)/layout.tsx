import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { BottomNav } from '@/components/bottom-nav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const token = cookieStore.get('driver_token')
  if (!token) redirect('/login')

  return (
    <div className="min-h-screen bg-[#020813] pb-20">
      {children}
      <BottomNav />
    </div>
  )
}
