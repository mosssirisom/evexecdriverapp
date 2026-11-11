import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BottomNav } from '@/components/bottom-nav'
import { ToastProvider } from '@/components/toast'
import { JobNotifier } from '@/components/job-notifier'
import { PushPrompt } from '@/components/push-prompt'
import { BusinessProvider } from '@/components/business'
import { loadBusiness } from '@/lib/business'
import { DEPLOYMENT_BUSINESS } from '@/lib/brand'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const business = await loadBusiness(supabase, user.id, DEPLOYMENT_BUSINESS)

  return (
    <BusinessProvider business={business}>
    <ToastProvider>
      <div className="min-h-screen bg-[#eaeff7] pb-28">
        <PushPrompt />
        {children}
        <BottomNav />
      </div>
      <JobNotifier />
    </ToastProvider>
    </BusinessProvider>
  )
}
