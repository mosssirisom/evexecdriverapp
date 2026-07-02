-- Phase 5b: Booking attestation (driver confirmation)
--
-- attestation_status: operator sets this when a booking needs driver acknowledgement
--   values: null (no attestation needed) | 'awaiting_first_attestation' | 'awaiting_second_attestation' | 'confirmed'
-- driver_confirmed_at: timestamp when driver tapped "Confirm Job"

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS attestation_status   text,
  ADD COLUMN IF NOT EXISTS driver_confirmed_at  timestamptz;
