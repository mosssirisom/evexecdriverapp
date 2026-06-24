import { PlaneLanding, MapPin } from 'lucide-react'

function isAirportBooking(booking: { flight_number?: string | null; journey_type?: string | null; airport?: string | null }): boolean {
  return !!(
    booking.flight_number ||
    (booking.journey_type ?? '').toLowerCase().includes('airport') ||
    booking.airport
  )
}

export function PickupIcon({
  booking,
  size = 13,
}: {
  booking: { flight_number?: string | null; journey_type?: string | null; airport?: string | null }
  size?: number
}) {
  return isAirportBooking(booking)
    ? <PlaneLanding size={size} color="#10b981" strokeWidth={1.5} className="flex-shrink-0" />
    : <MapPin size={size} color="#d5a538" strokeWidth={1.5} className="flex-shrink-0" />
}

export function DropoffIcon({ size = 13 }: { size?: number }) {
  return <MapPin size={size} color="rgba(255,255,255,0.35)" strokeWidth={1.5} className="flex-shrink-0" />
}
