import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { shapeDriverJob, type DriverJobStatus } from '@/lib/dispatch'

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const allowedStatuses = new Set<DriverJobStatus | string>([
  'Dispatched',
  'Driver Started',
  'En Route',
  'Driver Arrived',
  'Passenger On Board',
  'Completed',
  'Cancelled',
])

function serverSupabase() {
  if (!supabaseUrl || !serviceKey) return null
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ ref: string }> }
) {
  const supabase = serverSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Driver app Supabase server env vars missing' }, { status: 500 })
  }

  const { ref } = await context.params
  const bookingRef = decodeURIComponent(ref || '').trim()
  if (!bookingRef) {
    return NextResponse.json({ error: 'Missing booking reference' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const status = text(body.status)
  if (!allowedStatuses.has(status)) {
    return NextResponse.json({ error: 'Invalid job status' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('bookings')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('ref', bookingRef)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, job: shapeDriverJob(data) })
}
