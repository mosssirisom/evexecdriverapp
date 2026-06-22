-- Phase 2: Passenger preferences and wait time
--
-- passenger_preferences: array of tags set by the operator (e.g. "quiet_ride",
--   "cool_temperature", "help_with_luggage") so the driver can greet correctly.
-- wait_time_minutes: override for how many minutes free wait is allowed;
--   when null the app falls back to journey-type defaults (airport 60, hotel 30,
--   station 20, other 15).

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS passenger_preferences jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS wait_time_minutes      int;
