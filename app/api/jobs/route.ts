import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { shapeDriverJob } from '@/lib/dispatch'

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const allowedStatuses = new Set([
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

function splitRoute(route: string) {
  const parts = route.split('→').map((part) => part.trim()).filter(Boolean)
  return {
    airport: parts[0] || null,
    destination: parts.slice(1).join(' → ') || null,
  }
}

export async function GET(req: NextRequest) {
  const supabase = serverSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Driver app Supabase server env vars missing' }, { status: 500 })
  }

  const url = new URL(req.url)
  const driverId = text(url.searchParams.get('driverId'))
  if (!driverId) {
    return NextResponse.json({ error: 'Missing driverId' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .or(`driver_id.eq.${driverId},assigned_driver_id.eq.${driverId}`)
    .not('status', 'eq', 'Completed')
    .not('status', 'eq', 'Cancelled')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, jobs: (data || []).map(shapeDriverJob) })
}

export async function POST(req: NextRequest) {
  const supabase = serverSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Driver app Supabase server env vars missing' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const ref = text(body.bookingRef || body.ref)
  if (!ref) {
    return NextResponse.json({ error: 'Missing booking reference' }, { status: 400 })
  }

  const routeParts = splitRoute(text(body.route))
  const payload = {
    ref,
    customer_name: text(body.customer) || 'Customer',
    customer_phone: text(body.phone) || null,
    customer_email: text(body.email) || null,
    flight: text(body.flight) || null,
    airport: text(body.airport) || routeParts.airport,
    destination: text(body.destination) || routeParts.destination,
    pickup_time: text(body.pickupTime) || null,
    price: body.price ? Number(String(body.price).replace(/[^0-9.]/g, '')) || null : null,
    driver_id: body.driverId || null,
    assigned_driver_id: body.driverId || null,
    status: text(body.status) || 'Dispatched',
    notes: text(body.notes) || null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('bookings')
    .upsert(payload, { onConflict: 'ref' })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, job: shapeDriverJob(data) })
}

export async function PATCH(req: NextRequest) {
  const supabase = serverSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Driver app Supabase server env vars missing' }, { status: 500 })
  }

  const url = new URL(req.url)
  const body = await req.json().catch(() => ({}))
  const bookingRef = text(url.searchParams.get('ref') || body.bookingRef || body.ref)
  const status = text(body.status)

  if (!bookingRef) {
    return NextResponse.json({ error: 'Missing booking reference' }, { status: 400 })
  }
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
