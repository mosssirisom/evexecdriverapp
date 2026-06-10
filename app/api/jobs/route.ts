import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { shapeDriverJob } from '@/lib/dispatch'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const smsWebhookUrl = process.env.SMS_WEBHOOK_URL || ''
const dispatcherWebhookUrl = process.env.DISPATCHER_WEBHOOK_URL || ''

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

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}

function customerMessage(status: string, booking: Record<string, any>) {
  const ref = booking.ref ? ` Ref: ${booking.ref}.` : ''
  if (status === 'En Route') return `EV Exec update: your driver is now on the way.${ref}`
  if (status === 'Driver Arrived') return `EV Exec update: your driver has arrived and is outside.${ref}`
  if (status === 'Passenger On Board') return `EV Exec update: passenger is now on board.${ref}`
  if (status === 'Completed') return `Thank you for travelling with EV Exec. We hope you had a smooth journey.${ref}`
  return null
}

async function postWebhook(url: string, payload: Record<string, unknown>) {
  if (!url) return
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Webhook returned ${res.status}`)
}

async function notifyStatusChange(status: string, booking: Record<string, any>) {
  const customerPhone = text(booking.customer_phone)
  const message = customerMessage(status, booking)
  await Promise.allSettled([
    message && customerPhone
      ? postWebhook(smsWebhookUrl, {
          to: customerPhone,
          message,
          bookingRef: booking.ref || null,
          status,
          customerName: booking.customer_name || null,
        })
      : Promise.resolve(),
    postWebhook(dispatcherWebhookUrl, {
      bookingRef: booking.ref || null,
      status,
      customerName: booking.customer_name || null,
      customerPhone: customerPhone || null,
      updatedAt: new Date().toISOString(),
    }),
  ])
}

export async function GET(req: NextRequest) {
  const supabase = serverSupabase()
  if (!supabase) return json({ error: 'Driver app Supabase server env vars missing' }, 500)

  const url = new URL(req.url)
  const driverId = text(url.searchParams.get('driverId'))
  if (!driverId) return json({ error: 'Missing driverId' }, 400)

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .or(`driver_id.eq.${driverId},assigned_driver_id.eq.${driverId}`)
    .not('status', 'eq', 'Completed')
    .not('status', 'eq', 'Cancelled')
    .order('created_at', { ascending: false })

  if (error) return json({ error: error.message }, 500)
  return json({ ok: true, jobs: (data || []).map(shapeDriverJob) })
}

export async function POST(req: NextRequest) {
  const supabase = serverSupabase()
  if (!supabase) return json({ error: 'Driver app Supabase server env vars missing' }, 500)

  const body = await req.json().catch(() => ({}))
  const ref = text(body.bookingRef || body.ref)
  if (!ref) return json({ error: 'Missing booking reference' }, 400)

  const routeParts = splitRoute(text(body.route))
  const driverId = text(body.driverId) || null
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
    driver_id: driverId,
    assigned_driver_id: driverId,
    status: text(body.status) || 'Dispatched',
    notes: text(body.notes) || null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('bookings')
    .upsert(payload, { onConflict: 'ref' })
    .select('*')
    .single()

  if (error) return json({ error: error.message }, 500)
  return json({ ok: true, job: shapeDriverJob(data) })
}

export async function PATCH(req: NextRequest) {
  const supabase = serverSupabase()
  if (!supabase) return json({ error: 'Driver app Supabase server env vars missing' }, 500)

  const url = new URL(req.url)
  const body = await req.json().catch(() => ({}))
  const bookingRef = text(url.searchParams.get('ref') || body.bookingRef || body.ref)
  const status = text(body.status)

  if (!bookingRef) return json({ error: 'Missing booking reference' }, 400)
  if (!allowedStatuses.has(status)) return json({ error: 'Invalid job status' }, 400)

  const { data: existing, error: readError } = await supabase
    .from('bookings')
    .select('*')
    .eq('ref', bookingRef)
    .single()

  if (readError) return json({ error: readError.message }, 500)
  if (existing?.status === status) return json({ ok: true, unchanged: true, job: shapeDriverJob(existing) })

  const { data, error } = await supabase
    .from('bookings')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('ref', bookingRef)
    .select('*')
    .single()

  if (error) return json({ error: error.message }, 500)

  await notifyStatusChange(status, data).catch((err) => {
    console.warn('[EV Exec] Status notification failed:', err.message)
  })

  return json({ ok: true, job: shapeDriverJob(data) })
}
