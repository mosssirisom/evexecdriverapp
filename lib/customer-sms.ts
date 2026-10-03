import type { Booking, BookingStatus } from './types'
import { formatTime } from './format'

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
  const signOff = `Kind regards,\n${driverFirst}, EV Exec Chauffeur Services`

  if (status === 'En Route') {
    const time = booking.travel_time ? ` for your ${formatTime(booking.travel_time)} pickup` : ''
    const flight = booking.flight_number
      ? ` I'm keeping an eye on flight ${booking.flight_number.toUpperCase()} and will adjust if it changes.`
      : ''
    return [
      hello,
      ``,
      `This is ${driverFirst}, your EV Exec chauffeur. I'm now on my way to ${pickup}${time}.${flight}`,
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

/** sms: link that opens the driver's messaging app with the text pre-filled.
 *  `?&body=` is the form both iOS and Android accept. */
export function smsHref(phone: string, body: string): string {
  return `sms:${phone.replace(/\s+/g, '')}?&body=${encodeURIComponent(body)}`
}
