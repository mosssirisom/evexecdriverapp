// Geo-aware "next best driver" lookup used by the reallocation cascade.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export interface DriverCandidate {
  id: string
  full_name: string | null
  phone: string | null
  current_lat: number | null
  current_lng: number | null
  rating: number | null
}

export interface BookingForDispatch {
  assigned_driver_id: string | null
  excluded_driver_ids: string[] | null
  travel_date: string | null
  pickup_lat: number | null
  pickup_lng: number | null
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/**
 * Finds the next best available driver for a booking.
 *
 * - Excludes the driver(s) who already failed to attest for this booking.
 * - Excludes drivers who are offline, suspended, or off duty.
 * - Excludes drivers with a `driver_unavailable_dates` entry for the
 *   booking's travel date (shift-window check).
 * - Ranks by distance to `pickup_lat`/`pickup_lng` (Haversine) when both the
 *   booking and a candidate have coordinates; otherwise falls back to
 *   driver rating (highest first), so the loop still works for bookings or
 *   drivers without geocoded locations.
 *
 * Returns null if no eligible driver is found (the caller should then raise
 * the operator panic gate).
 */
export async function findNextAvailableDriver(
  supabase: SupabaseClient,
  booking: BookingForDispatch
): Promise<DriverCandidate | null> {
  const excluded = new Set<string>([
    ...(booking.excluded_driver_ids ?? []),
    ...(booking.assigned_driver_id ? [booking.assigned_driver_id] : []),
  ])

  const { data: drivers, error } = await supabase
    .from('drivers')
    .select('id, full_name, phone, current_lat, current_lng, rating, status, is_online')
    .eq('is_online', true)
    .not('status', 'in', '("Suspended","Off duty")')

  if (error || !drivers) return null

  let candidates = (drivers as DriverCandidate[]).filter((d) => !excluded.has(d.id))
  if (candidates.length === 0) return null

  if (booking.travel_date) {
    const { data: unavailable } = await supabase
      .from('driver_unavailable_dates')
      .select('driver_id')
      .eq('date', booking.travel_date)
      .in('driver_id', candidates.map((d) => d.id))

    const unavailableIds = new Set((unavailable ?? []).map((u: { driver_id: string }) => u.driver_id))
    candidates = candidates.filter((d) => !unavailableIds.has(d.id))
  }

  if (candidates.length === 0) return null

  if (booking.pickup_lat != null && booking.pickup_lng != null) {
    const pickupLat = booking.pickup_lat
    const pickupLng = booking.pickup_lng
    candidates.sort((a, b) => {
      const da = a.current_lat != null && a.current_lng != null
        ? haversineKm(pickupLat, pickupLng, a.current_lat, a.current_lng)
        : Number.POSITIVE_INFINITY
      const db = b.current_lat != null && b.current_lng != null
        ? haversineKm(pickupLat, pickupLng, b.current_lat, b.current_lng)
        : Number.POSITIVE_INFINITY
      if (da !== db) return da - db
      return (b.rating ?? 0) - (a.rating ?? 0)
    })
  } else {
    candidates.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
  }

  return candidates[0]
}
