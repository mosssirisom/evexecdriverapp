import { MapPin, PlaneLanding, Flag } from 'lucide-react'

function isAirportBooking(booking: {
  flight_number?: string | null
  journey_type?: string | null
  airport?: string | null
}): boolean {
  return !!(
    booking.flight_number ||
    (booking.journey_type ?? '').toLowerCase().includes('airport') ||
    booking.airport
  )
}

/** Pickup icon — plane for airport, map pin for regular */
export function PickupIcon({
  booking,
  size = 12,
}: {
  booking: { flight_number?: string | null; journey_type?: string | null; airport?: string | null }
  size?: number
}) {
  return isAirportBooking(booking) ? (
    <PlaneLanding size={size} className="flex-shrink-0 text-[#10b981]" />
  ) : (
    <MapPin size={size} className="flex-shrink-0 text-[#d5a538]" />
  )
}

/** Dropoff icon — flag marker for destination */
export function DropoffIcon({ size = 12 }: { size?: number }) {
  return <Flag size={size} className="flex-shrink-0 text-white/30" />
}

/**
 * Connected vertical route timeline for compact card list views.
 * Renders an origin icon → connector line → destination icon alongside
 * the two address strings.
 */
export function RouteDisplay({
  booking,
}: {
  booking: {
    flight_number?: string | null
    journey_type?: string | null
    airport?: string | null
    pickup_location?: string | null
    dropoff_address?: string | null
  }
}) {
  const airport = isAirportBooking(booking)
  const pickup = booking.pickup_location ?? booking.airport ?? '—'
  const dropoff = booking.dropoff_address ?? booking.airport ?? null

  return (
    <div className="flex gap-2.5">
      {/* Left: vertical timeline icons */}
      <div className="flex flex-col items-center flex-shrink-0 pt-[1px]">
        {airport ? (
          <PlaneLanding size={10} className="flex-shrink-0 text-[#10b981]" />
        ) : (
          <MapPin size={10} className="flex-shrink-0 text-[#d5a538]" />
        )}
        {dropoff && (
          <>
            <div className="w-px flex-1 min-h-[10px] bg-white/10 my-[2px]" />
            <Flag size={10} className="flex-shrink-0 text-white/30" />
          </>
        )}
      </div>
      {/* Right: addresses */}
      <div className="flex-1 min-w-0">
        <p className="text-white/55 text-xs leading-tight truncate">{pickup}</p>
        {dropoff && (
          <p className="text-white/30 text-xs leading-tight truncate mt-[7px]">{dropoff}</p>
        )}
      </div>
    </div>
  )
}
