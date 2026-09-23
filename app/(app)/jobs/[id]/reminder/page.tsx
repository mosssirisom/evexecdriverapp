'use client'

import { useEffect, useState, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, MessageSquare, Copy, CheckCircle2, Phone, Plane } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatDate, formatTime } from '@/lib/format'
import { useToast } from '@/components/toast'
import type { Booking } from '@/lib/types'

type ReminderStatus = 'pending' | 'opened' | 'sent'
type ReminderKind = '7day' | '24hr' | 'en_route' | 'arrived' | 'cancelled'

const KIND_LABEL: Record<ReminderKind, string> = {
  '7day': 'Customer Reminder',
  '24hr': 'Customer Reminder',
  en_route: 'Customer Update — On The Way',
  arrived: 'Customer Update — Arrived',
  cancelled: 'Customer Update — Cancelled',
}

interface DriverSmsReminder {
  id: string
  booking_id: string
  reminder_type: ReminderKind
  customer_name: string | null
  customer_phone: string
  travel_date: string | null
  travel_time: string | null
  message: string
  status: ReminderStatus
  sent_at: string | null
}

export default function ReminderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ type?: string }>
}) {
  const { id } = use(params)
  const { type } = use(searchParams)
  const router = useRouter()
  const { addToast } = useToast()

  const [booking, setBooking] = useState<Booking | null>(null)
  const [reminder, setReminder] = useState<DriverSmsReminder | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [marking, setMarking] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      let reminderQuery = supabase
        .from('driver_sms_reminders')
        .select('id, booking_id, reminder_type, customer_name, customer_phone, travel_date, travel_time, message, status, sent_at')
        .eq('booking_id', id)
        .order('created_at', { ascending: false })
        .limit(1)

      if (type === '7day' || type === '24hr' || type === 'en_route' || type === 'arrived' || type === 'cancelled') {
        reminderQuery = supabase
          .from('driver_sms_reminders')
          .select('id, booking_id, reminder_type, customer_name, customer_phone, travel_date, travel_time, message, status, sent_at')
          .eq('booking_id', id)
          .eq('reminder_type', type)
          .limit(1)
      }

      const [{ data: b }, { data: r }] = await Promise.all([
        supabase.from('bookings').select('*').eq('id', id).single(),
        reminderQuery.maybeSingle(),
      ])

      if (!b || !r) { setNotFound(true); setLoading(false); return }

      setBooking(b)
      setReminder(r)
      setLoading(false)

      if (r.status === 'pending') {
        const { data: updated } = await supabase
          .from('driver_sms_reminders')
          .update({ status: 'opened', opened_at: new Date().toISOString() })
          .eq('id', r.id)
          .select('id, booking_id, reminder_type, customer_name, customer_phone, travel_date, travel_time, message, status, sent_at')
          .single()
        if (updated) setReminder(updated)
      }
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, type])

  const markAsSent = useCallback(async () => {
    if (!reminder || marking) return
    setMarking(true)
    const { data: updated } = await supabase
      .from('driver_sms_reminders')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', reminder.id)
      .select('id, booking_id, reminder_type, customer_name, customer_phone, travel_date, travel_time, message, status, sent_at')
      .single()
    if (updated) setReminder(updated)
    setMarking(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminder, marking])

  const copyMessage = useCallback(async () => {
    if (!reminder) return
    try {
      await navigator.clipboard.writeText(reminder.message)
      addToast({ title: 'Copied', message: 'Reminder message copied to clipboard.' })
    } catch {
      addToast({ title: 'Copy failed', message: 'Select and copy the message text manually.' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminder])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#eaeff7] flex items-center justify-center">
        <div className="w-7 h-7 rounded-full border-2 border-[#d5a538] border-t-transparent animate-spin" />
      </div>
    )
  }

  if (notFound || !booking || !reminder) {
    return (
      <div className="min-h-screen bg-[#eaeff7] px-4 pt-12 pb-8">
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-[#4a6a8a] text-sm mb-6">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="bg-white border border-[#c4d4e4] rounded-2xl p-8 text-center max-w-md mx-auto">
          <p className="text-[#7a9ab8] text-sm">This reminder is no longer available.</p>
        </div>
      </div>
    )
  }

  // Airport journeys store the address on one side and the airport name on
  // the other, depending on direction -- same fallback pattern used
  // throughout the app (pickup_location/dropoff_address take priority,
  // airport fills in whichever side doesn't have a literal address).
  const pickup = booking.pickup_location || booking.airport || null
  const dropoff = booking.dropoff_address || booking.airport || null
  const customerName = reminder.customer_name || booking.customer_name
  const when = [formatDate(reminder.travel_date), reminder.travel_time ? formatTime(reminder.travel_time) : null]
    .filter(Boolean)
    .join(' at ')

  const smsHref = `sms:${reminder.customer_phone}?body=${encodeURIComponent(reminder.message)}`
  const isSent = reminder.status === 'sent'

  return (
    <div className="min-h-screen bg-[#eaeff7] px-4 pt-12 pb-10">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-[#4a6a8a] text-sm mb-6">
        <ArrowLeft size={16} /> Back
      </button>

      <div className="max-w-md mx-auto">
        <p className="text-[#7a9ab8] text-[10px] uppercase tracking-widest font-semibold mb-1">{KIND_LABEL[reminder.reminder_type]}</p>
        <h1 className="text-[#060C1A] font-bold text-xl mb-6">{customerName}</h1>

        {/* Details card */}
        <div className="bg-white border border-[#c4d4e4] rounded-2xl p-5 mb-4 space-y-4">
          <Row label="Customer" value={customerName} />
          <Row label="Mobile" value={reminder.customer_phone} icon={<Phone size={13} className="text-[#7a9ab8]" />} />
          {when && <Row label="Pickup" value={when} />}
          {pickup && <Row label="From" value={pickup} />}
          {dropoff && <Row label="To" value={dropoff} />}
          {booking.flight_number && (
            <Row label="Flight" value={booking.flight_number} icon={<Plane size={13} className="text-[#7a9ab8]" />} />
          )}
          {booking.passengers > 1 && <Row label="Passengers" value={String(booking.passengers)} />}
        </div>

        {/* Message preview */}
        <div className="bg-white border border-[#c4d4e4] rounded-2xl p-5 mb-4">
          <p className="text-[#7a9ab8] text-[10px] uppercase tracking-widest font-semibold mb-3">Message Preview</p>
          <p className="text-[#060C1A] text-sm leading-relaxed whitespace-pre-line">{reminder.message}</p>
        </div>

        {/* Actions */}
        {!isSent ? (
          <>
            <a
              href={smsHref}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-[15px] text-[#020813] active:opacity-90"
              style={{ background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)' }}
            >
              <MessageSquare size={17} />
              Open Messages
            </a>

            <button
              onClick={copyMessage}
              className="w-full flex items-center justify-center gap-2 py-3 mt-3 rounded-2xl bg-white border border-[#c4d4e4] text-[#2d4c6d] text-sm font-medium active:opacity-70"
            >
              <Copy size={14} />
              Copy Message
            </button>

            <p className="text-center text-[#a8c0d4] text-xs mt-3">
              Messages will open with the reminder ready to send.
            </p>

            <button
              onClick={markAsSent}
              disabled={marking}
              className="w-full flex items-center justify-center gap-2 py-3 mt-6 rounded-2xl bg-[#060C1A] text-white text-sm font-semibold active:opacity-80 disabled:opacity-50"
            >
              <CheckCircle2 size={15} />
              {marking ? 'Marking as sent…' : 'Mark as Sent'}
            </button>
          </>
        ) : (
          <div className="bg-white border border-[#c4d4e4] rounded-2xl p-5 text-center">
            <CheckCircle2 size={22} className="mx-auto mb-2 text-green-500" />
            <p className="text-[#060C1A] font-semibold text-sm">Marked as sent</p>
            {reminder.sent_at && (
              <p className="text-[#7a9ab8] text-xs mt-1">
                {new Date(reminder.sent_at).toLocaleString('en-GB', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
                })}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[#7a9ab8] text-xs flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-[#060C1A] text-sm font-medium text-right flex items-center gap-1.5 justify-end">
        {icon}
        {value}
      </span>
    </div>
  )
}
