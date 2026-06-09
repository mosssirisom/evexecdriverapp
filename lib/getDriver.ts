import type { SupabaseClient } from '@supabase/supabase-js'

export interface DriverRecord {
  id: string
  name: string
  email: string | null
  phone: string | null
  vehicle: string | null
  plate: string | null
  status: string | null
  is_online: boolean
  rating: number | null
}

export async function getDriverByEmail(
  supabase: SupabaseClient,
  email: string | null | undefined
): Promise<DriverRecord | null> {
  if (!email) return null
  const { data } = await supabase
    .from('drivers')
    .select('id, name, email, phone, vehicle, plate, status, is_online, rating')
    .eq('email', email)
    .single()
  return data ?? null
}
