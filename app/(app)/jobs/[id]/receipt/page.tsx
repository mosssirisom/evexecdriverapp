'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Printer, CheckCircle2, MessageSquare, Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatDate, formatTime, paymentInfo } from '@/lib/format'
import type { Booking, BookingExpense } from '@/lib/types'

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [booking, setBooking] = useState<Booking | null>(null)
  const [expenses, setExpenses] = useState<BookingExpense[]>([])
  const [driverName, setDriverName] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [{ data: b }, { data: exp }, { data: profile }] = await Promise.all([
        supabase.from('bookings').select('*').eq('id', id).single(),
        supabase.from('booking_expenses').select('*').eq('booking_id', id).order('created_at'),
        supabase.from('drivers').select('full_name').eq('id', user.id).single(),
      ])

      if (!b) { router.push('/jobs'); return }
      setBooking(b)
      setExpenses(exp ?? [])
      setDriverName(profile?.full_name ?? '')
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060C1A] flex items-center justify-center">
        <div className="w-7 h-7 rounded-full border-2 border-[#d5a538] border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!booking) return null

  const ref = booking.ref ?? booking.id.slice(0, 8).toUpperCase()
  const p = paymentInfo(booking.payment_method, booking.payment_status)
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0)
  const totalCharged = (booking.quoted_price ?? 0) + expenseTotal
  // Airport journeys store destination in booking.airport; others use dropoff_address
  const dropoff = booking.dropoff_address || booking.airport

  // Build receipt text for SMS / email
  const lines = [
    `EV Exec Journey Receipt`,
    `Ref: ${ref}`,
    ``,
    `Passenger: ${booking.customer_name}`,
    `Date: ${formatDate(booking.travel_date)} at ${formatTime(booking.travel_time)}`,
    booking.pickup_location ? `From: ${booking.pickup_location}` : null,
    dropoff ? `To: ${dropoff}` : null,
    booking.flight_number ? `Flight: ${booking.flight_number}` : null,
    ``,
    `Driver: ${driverName}`,
    totalCharged > 0 ? `Total: £${totalCharged.toFixed(2)}` : null,
    `Payment: ${p.text}`,
    ``,
    `EV Exec Chauffeur Services · evexec.co.uk`,
  ].filter(Boolean).join('\n')

  const smsHref = `sms:${booking.customer_phone}&body=${encodeURIComponent(lines)}`
  const emailHref = booking.customer_email
    ? `mailto:${booking.customer_email}?subject=${encodeURIComponent(`EV Exec Journey Receipt – ${ref}`)}&body=${encodeURIComponent(lines)}`
    : null

  const hasContact = booking.customer_phone || emailHref

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
          .receipt-card { background: white !important; border: none !important; box-shadow: none !important; }
          .print-black { color: black !important; }
          .print-gray { color: #555 !important; }
          .print-divider { border-color: #ddd !important; }
          .print-label { color: #777 !important; }
        }
      `}</style>

      <div className="min-h-screen bg-[#060C1A] px-4 pt-12 pb-8">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-4 no-print">
          <button onClick={() => router.back()} className="flex items-center gap-1.5 text-white/50 text-sm">
            <ArrowLeft size={16} /> Back
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-[#020813]"
            style={{ background: 'linear-gradient(135deg, #f1c56a, #d5a538 55%, #a97918)' }}
          >
            <Printer size={15} />
            Save / Print
          </button>
        </div>

        {/* Send to customer buttons */}
        {hasContact && (
          <div className="flex gap-2 mb-4 no-print max-w-md mx-auto">
            {booking.customer_phone && (
              <a
                href={smsHref}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#0B1525] border border-white/10 text-white/70 text-sm font-medium active:opacity-70"
              >
                <MessageSquare size={14} className="text-[#10b981]" />
                Send via SMS
              </a>
            )}
            {emailHref && (
              <a
                href={emailHref}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#0B1525] border border-white/10 text-white/70 text-sm font-medium active:opacity-70"
              >
                <Mail size={14} className="text-[#d5a538]" />
                Send via Email
              </a>
            )}
          </div>
        )}

        {/* Receipt card */}
        <div className="receipt-card bg-[#0B1525] border border-white/8 rounded-2xl p-6 max-w-md mx-auto">
          {/* Header */}
          <div className="text-center mb-6 pb-5 border-b border-white/8 print-divider">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="EV Exec" width={64} height={64} className="mx-auto mb-3" />
            <p className="text-white/40 text-[10px] uppercase tracking-widest print-gray">Journey Receipt</p>
            <h1 className="text-[#d5a538] font-bold text-2xl mt-1 tracking-wide print-black" style={{ fontFamily: 'monospace' }}>
              {ref}
            </h1>
          </div>

          {/* Status */}
          <div className="flex items-center justify-center gap-2 mb-5">
            <CheckCircle2 size={16} className="text-green-400" />
            <span className="text-green-400 text-sm font-semibold">Journey Completed</span>
            {booking.completed_at && (
              <span className="text-white/30 text-xs print-label">
                {new Date(booking.completed_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>

          {/* Journey details */}
          <div className="space-y-3 mb-5">
            <Row label="Date" value={formatDate(booking.travel_date)} />
            <Row label="Pickup time" value={formatTime(booking.travel_time)} />
            <Row label="Passenger" value={booking.customer_name} />
            {booking.passengers > 1 && <Row label="Passengers" value={String(booking.passengers)} />}
            {booking.journey_type && (
              <Row label="Journey type" value={booking.journey_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} />
            )}
            {booking.flight_number && <Row label="Flight" value={booking.flight_number} />}
          </div>

          {/* Route */}
          <div className="bg-white/4 rounded-xl p-3 mb-5 border border-white/5">
            {booking.pickup_location && (
              <div className="flex gap-2 mb-2.5">
                <span className="text-[#d5a538] text-xs font-bold w-12 pt-0.5 print-black flex-shrink-0">FROM</span>
                <span className="text-white text-sm print-black flex-1">{booking.pickup_location}</span>
              </div>
            )}
            {dropoff && (
              <div className="flex gap-2">
                <span className="text-white/40 text-xs font-bold w-12 pt-0.5 print-gray flex-shrink-0">TO</span>
                <span className="text-white text-sm print-black flex-1">{dropoff}</span>
              </div>
            )}
            {!booking.pickup_location && !dropoff && (
              <p className="text-white/30 text-xs">Route not recorded</p>
            )}
          </div>

          {/* Driver */}
          {driverName && <Row label="Driver" value={driverName} />}

          {/* Financials */}
          <div className="mt-4 pt-4 border-t border-white/8 print-divider space-y-2">
            {booking.quoted_price != null && (
              <Row label="Journey fare" value={`£${booking.quoted_price.toFixed(2)}`} />
            )}
            {expenses.map(e => (
              <Row key={e.id} label={e.type.charAt(0).toUpperCase() + e.type.slice(1).replace(/_/g, ' ')} value={`£${e.amount.toFixed(2)}`} />
            ))}
            {totalCharged > 0 && (
              <div className="flex items-center justify-between pt-2 border-t border-white/8 print-divider">
                <span className="text-white font-bold text-sm print-black">Total</span>
                <span className="text-[#d5a538] font-bold text-lg print-black">£{totalCharged.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-white/40 text-xs print-label">Payment</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.className}`}>{p.text}</span>
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-white/20 text-[10px] mt-6 print-label">
            EV Exec Chauffeur Services · evexec.co.uk
          </p>
        </div>
      </div>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-white/40 text-xs print-label flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-white text-sm font-medium print-black text-right">{value}</span>
    </div>
  )
}
