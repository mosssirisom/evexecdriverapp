// notify-job-update
//
// Triggered by a DB trigger whenever a booking's status changes to cancelled
// or key journey details (travel_date, travel_time, pickup_location, airport,
// dropoff_address) are changed while a driver is assigned. Requests must carry
// the trigger's x-webhook-secret; the booking is read from the database.
// Logic lives in handler.ts.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { pushToDriver, queueEmail } from '../_shared/notify.ts'
import { handleJobUpdate } from './handler.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? 'https://evexecdriverapp.vercel.app'

Deno.serve((req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  return handleJobUpdate(req, {
    appUrl: APP_URL,
    loadWebhookSecret: async () => {
      const { data, error } = await supabase.rpc('driver_alert_webhook_secrets')
      if (error) throw error
      return (data as string[] | null) ?? null
    },
    loadBooking: async (id) => {
      const { data } = await supabase
        .from('bookings')
        .select('id, ref, status, assigned_driver_id, customer_name, travel_date, travel_time, pickup_location, airport, dropoff_address, notes')
        .eq('id', id)
        .maybeSingle()
      return data ?? null
    },
    pushToDriver: (p) => pushToDriver(supabase, p),
    loadDriver: async (id) => {
      const { data } = await supabase.from('drivers').select('email, full_name').eq('id', id).maybeSingle()
      return data ?? null
    },
    queueEmail: (r) => queueEmail(supabase, r),
  })
})
