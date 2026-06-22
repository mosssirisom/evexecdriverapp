-- Phase 3: Flight status cache
--
-- Stores the last-fetched FlightAware result on the booking row so the app
-- can show the cached result instantly while a background refresh is in flight.
-- The JSON shape mirrors what track-flight returns:
--   { status, origin, destination, scheduled_arrival, estimated_arrival,
--     actual_arrival, gate, baggage_claim, delay_minutes, tail_number }

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS flight_status      jsonb,
  ADD COLUMN IF NOT EXISTS flight_checked_at  timestamptz;
