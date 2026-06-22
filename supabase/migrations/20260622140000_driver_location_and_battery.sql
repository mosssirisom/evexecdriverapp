-- Phase 5a: Driver GPS location + battery level
--
-- current_lat/lng: real-time position updated by the driver app while en route
-- location_updated_at: timestamp for staleness checks
-- battery_percent: manually set EV battery level (0–100)
-- rating: average passenger rating (set by operator portal)

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS current_lat          double precision,
  ADD COLUMN IF NOT EXISTS current_lng          double precision,
  ADD COLUMN IF NOT EXISTS location_updated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS battery_percent      int CHECK (battery_percent BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS rating               decimal(3,2) CHECK (rating BETWEEN 0 AND 5);
