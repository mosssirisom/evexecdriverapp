-- The bookings_status_check constraint only contained 7 values and was
-- missing Arrived, accepted, confirmed, en_route, active, No Show, etc.
-- Rebuild it to match the full BookingStatus type in lib/types.ts.

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK (status = ANY (ARRAY[
  'pending',
  'accepted',
  'confirmed',
  'Dispatched',
  'rejected',
  'cancelled',
  'Cancelled',
  'en_route',
  'En Route',
  'arrived',
  'Arrived',
  'active',
  'Active',
  'Passenger On Board',
  'No Show',
  'completed',
  'Completed',
  'Unassigned',
  'Unassigned / Missed Call Recovery',
  'CRITICAL_UNALLOCATED'
]::text[]));
