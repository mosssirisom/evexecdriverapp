import { redirect } from 'next/navigation'

// Old link format used by the "Customer reminder due" push
// (send-customer-sms-reminder-push): /jobs/<id>/reminder?type=24hr|7day.
// The reminder now lives on the job screen itself.
export default async function ReminderRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ type?: string }>
}) {
  const { id } = await params
  const { type } = await searchParams
  redirect(type === '24hr' || type === '7day' ? `/jobs/${id}?reminder=${type}` : `/jobs/${id}`)
}
