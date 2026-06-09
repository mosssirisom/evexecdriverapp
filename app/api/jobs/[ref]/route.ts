import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { shapeDriverJob, type DriverJobStatus } from '@/lib/dispatch'

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const smsWebhookUrl = process.env.SMS_WEBHOOK_URL || ''
const dispatcherWebhookUrl = process.env.DISPATCHER_WEBHOOK_URL || ''

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

function customerMessage(status: string, booking: Record<string, any>) {
  const ref = booking.ref ? ` Ref: ${booking.ref}.` : ''
  if (status === 'En Route') return `EV Exec update: your driver is now on the way.${ref}`
  if (status === 'Driver Arrived') return `EV Exec update: your driver has arrived and is outside.${ref}`
  if (status === 'Passenger On Board') return `EV Exec update: passenger is now on board.${ref}`
  if (status === 'Completed') return `Thank you for travelling with EV Exec. We hope you had a smooth journey.${ref}`
  return null
}

async function postWebhook(url: string, payload: Record<string, any>) {
  if (!url) return { skipped: true }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Webhook returned ${res.status}`)
  return { ok: true }
}

async function notifyStatusChange(status: string, booking: Record<string, any>) {
  const customerPhone = text(booking.customer_phone)
  const message = customerMessage(status, booking)

  await Promise.allSettled([
    message && customerPhone
      ? postWebhook(smsWebhookUrl, {
          to: customerPhone,
          message,
          bookingRef: booking.ref,
          status,
          customerName: booking.customer_name || null,
        })
      : Promise.resolve({ skipped: true }),
    postWebhook(dispatcherWebhookUrl, {
      bookingRef: booking.ref,
      status,
      customerName: booking.customer_name || null,
      customerPhone: customerPhone || null,
      updatedAt: new Date().toISOString(),
    }),
  ])
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

  await notifyStatusChange(status, data).catch((err) => {
    console.warn('[EV Exec] Status notification failed:', err.message)
  })

  return NextResponse.json({ ok: true, job: shapeDriverJob(data) })
}
