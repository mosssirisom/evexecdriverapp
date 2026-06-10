'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function confirmAttestation(bookingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('bookings')
    .update({
      attestation_status: 'confirmed',
      driver_confirmed_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .eq('assigned_driver_id', user.id)
    .in('attestation_status', ['awaiting_first_attestation', 'awaiting_second_attestation'])
    .select('id')

  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'This job is no longer awaiting confirmation.' }

  revalidatePath('/dashboard')
  return { success: true }
}
