import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BottomNav } from '@/components/bottom-nav'
import { ToastProvider } from '@/components/toast'
import { JobNotifier } from '@/components/job-notifier'
import { PushPrompt } from '@/components/push-prompt'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#eaeff7] pb-28">
        <PushPrompt />
        {children}
        <BottomNav />
      </div>
      <JobNotifier />
    </ToastProvider>
  )
}
