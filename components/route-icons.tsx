import type { CSSProperties } from 'react'

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

/** Filled circle — pickup / origin */
export function PickupIcon({
  booking,
  size = 7,
}: {
  booking: { flight_number?: string | null; journey_type?: string | null; airport?: string | null }
  size?: number
}) {
  return (
    <div
      className="rounded-full flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: isAirportBooking(booking) ? '#10b981' : '#d5a538',
      } as CSSProperties}
    />
  )
}

/** Outlined circle — drop-off / destination */
export function DropoffIcon({ size = 7 }: { size?: number }) {
  return (
    <div
      className="rounded-full flex-shrink-0"
      style={{
        width: size,
        height: size,
        border: '1.5px solid rgba(255,255,255,0.25)',
      } as CSSProperties}
    />
  )
}

/**
 * Connected vertical route timeline for compact card list views.
 * Renders an origin dot → connector line → destination dot alongside
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
      {/* Left: vertical timeline markers */}
      <div className="flex flex-col items-center flex-shrink-0 mt-[3px]">
        <div
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: airport ? '#10b981' : '#d5a538' }}
        />
        {dropoff && (
          <>
            <div className="w-px flex-1 min-h-[10px] bg-white/10 my-[3px]" />
            <div className="w-1.5 h-1.5 rounded-full border border-white/20 flex-shrink-0" />
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
