import type { Booking, BookingStatus } from './types'
import { formatDate, formatTime } from './format'

// Pre-filled customer update texts, sent manually from the driver's own phone
// (sms: link) when they swipe the job progress bar. No Twilio cost.

export interface SmsDriver {
  full_name: string | null
  vehicle_model: string | null
  vehicle_registration: string | null
}

function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? ''
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function vehicleLine(driver: SmsDriver | null, lead: string): string | null {
  const model = driver?.vehicle_model?.trim()
  const reg = driver?.vehicle_registration?.trim().toUpperCase()
  if (model && reg) return `${lead} a ${model}, registration ${reg}.`
  if (model) return `${lead} a ${model}.`
  if (reg) return `My vehicle registration is ${reg}.`
  return null
}

/**
 * Returns the pre-filled text for the status the driver just swiped to, or
 * null when no customer update is needed (e.g. on board / completed — the
 * customer is already with the driver).
 */
export function customerUpdateSms(
  status: BookingStatus,
  booking: Booking,
  driver: SmsDriver | null,
): string | null {
  const customer = firstName(booking.customer_name)
  const driverFirst = firstName(driver?.full_name) || 'your driver'
  const pickup = booking.pickup_location ?? booking.airport ?? 'your pickup point'
  const ref = booking.ref ?? booking.id.slice(0, 8).toUpperCase()
  const hello = customer ? `${greeting()} ${customer},` : `${greeting()},`
  const signOff = `Kind regards,\n${driverFirst}, EV Exec`

  if (status === 'En Route') {
    const time = booking.travel_time ? ` for your ${formatTime(booking.travel_time)} pickup` : ''
    const flight = booking.flight_number
      ? ` I'm keeping an eye on flight ${booking.flight_number.toUpperCase()} and will adjust if it changes.`
      : ''
    return [
      hello,
      ``,
      `This is ${driverFirst}, your EV Exec driver. I'm now on my way to ${pickup}${time}.${flight}`,
      vehicleLine(driver, "I'll be in"),
      `I'll let you know as soon as I arrive. Booking ref: ${ref}.`,
      ``,
      signOff,
    ].filter(l => l !== null).join('\n')
  }

  if (status === 'Arrived') {
    const vehicle = vehicleLine(driver, "You'll find me in")
    return [
      hello,
      ``,
      `I've arrived at ${pickup} and am ready when you are.`,
      vehicle,
      `Please take your time, and reply or call this number if you need anything. Booking ref: ${ref}.`,
      ``,
      signOff,
    ].filter(l => l !== null).join('\n')
  }

  return null
}

// ─── 24hr customer reminder ─────────────────────────────────────────────────
// Sent by the driver from their own phone (sms: link), one per booking.
// A return trip is its own booking (created by the website), so it gets its
// own reminder there. Tracked in driver_sms_reminders as reminder_type '24hr',
// the same row the website's reminder cron creates.

export const REMINDER_TYPE = '24hr'

/** Today's date in the UK as YYYY-MM-DD, whatever the phone's timezone. */
export function ukToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

/** Whole calendar days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10))
  return Math.round((b - a) / 86_400_000)
}

export interface ReminderInfo {
  date: string | null
  time: string | null
  pickup: string | null
  flight: string | null
}

/** Date, time and pickup point for a booking (airport pickups start at the airport). */
export function reminderInfo(booking: Booking): ReminderInfo {
  const jt = (booking.journey_type ?? '').toLowerCase()
  const fromAirport = jt.includes('from') && jt.includes('airport')
  return {
    date: booking.travel_date ?? null,
    time: booking.travel_time ?? null,
    pickup: fromAirport
      ? (booking.airport ?? booking.pickup_location ?? null)
      : (booking.pickup_location ?? booking.airport ?? null),
    flight: fromAirport ? (booking.flight_number ?? null) : null,
  }
}

function dayPhrase(date: string, today: string): string {
  const long = formatDate(date)
  const diff = daysBetween(today, date)
  if (diff === 0) return `today (${long})`
  if (diff === 1) return `tomorrow (${long})`
  return `on ${long}`
}

/** Pre-filled 24hr reminder text. "today"/"tomorrow" is worked out from the
 *  UK date when the driver taps, so it is never stale. */
export function customerReminderSms(booking: Booking, today: string = ukToday()): string {
  const info = reminderInfo(booking)
  const customer = firstName(booking.customer_name)
  const ref = booking.ref ?? booking.id.slice(0, 8).toUpperCase()
  const when = info.date ? dayPhrase(info.date, today) : 'soon'
  const at = info.time ? ` at ${formatTime(info.time)}` : ''
  const where = info.pickup ? `Your driver will be with you at ${info.pickup}.` : null
  const flight = info.flight
    ? `We'll be tracking flight ${info.flight.toUpperCase()} and will adjust if it changes.`
    : null
  return [
    customer ? `Hi ${customer},` : 'Hi,',
    ``,
    `Just a quick reminder that your EV Exec journey is booked for ${when}${at}.`,
    [where, flight].filter(Boolean).join(' ') || null,
    `If you have any questions or need to make any changes, please let us know. Booking ref: ${ref}.`,
    ``,
    `Many thanks,`,
    `EV Exec`,
  ].filter(l => l !== null).join('\n')
}

/** sms: link that opens the driver's messaging app with the text pre-filled.
 *  `?&body=` is the form both iOS and Android accept. */
export function smsHref(phone: string, body: string): string {
  return `sms:${phone.replace(/\s+/g, '')}?&body=${encodeURIComponent(body)}`
}
