-- Phase 1: Driver journey timestamps + booking expenses
--
-- Adds per-stage timestamps to bookings so the operator portal can see
-- exactly when each milestone occurred, and creates a booking_expenses
-- table so drivers can log out-of-pocket costs (parking, ULEZ, etc.)

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS tracking_started_at  timestamptz,
  ADD COLUMN IF NOT EXISTS arrived_at            timestamptz,
  ADD COLUMN IF NOT EXISTS passenger_onboard_at  timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at          timestamptz,
  ADD COLUMN IF NOT EXISTS actual_distance_miles decimal(8,2),
  ADD COLUMN IF NOT EXISTS actual_duration_minutes int;

CREATE TABLE IF NOT EXISTS booking_expenses (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  type        text        NOT NULL,   -- parking | ulez | congestion | toll | airport_fee | other
  amount      decimal(8,2) NOT NULL,
  notes       text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE booking_expenses ENABLE ROW LEVEL SECURITY;

-- Drivers can manage expenses only for bookings assigned to them
CREATE POLICY "driver_own_expenses" ON booking_expenses
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = booking_expenses.booking_id
        AND b.assigned_driver_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = booking_expenses.booking_id
        AND b.assigned_driver_id = auth.uid()
    )
  );
