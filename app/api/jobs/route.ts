import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { shapeDriverJob } from '@/lib/dispatch'

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

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
