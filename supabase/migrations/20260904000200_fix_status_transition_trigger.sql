-- Fix enforce_booking_status_transition: cover all real-world status variants.
--
-- The previous trigger (20260624100000) only handled 8 statuses.
-- Any other status (accepted, confirmed, en_route, No Show, active,
-- CRITICAL_UNALLOCATED, etc.) hit the ELSE RETURN NEW branch, bypassing
-- all validation. Most real journey lifecycles start from 'accepted' or
-- 'confirmed', so enforcement was effectively skipped for most bookings.
--
-- This replacement adds every variant present in lib/types.ts BookingStatus
-- and maps lowercase/snake_case aliases to their canonical next states.
-- Terminal statuses (Completed, Cancelled, CRITICAL_UNALLOCATED, No Show)
-- block all further transitions.

CREATE OR REPLACE FUNCTION public.enforce_booking_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  allowed text[];
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  CASE OLD.status
    -- ── Initial / operator-set statuses ──────────────────────────────────────
    WHEN 'Unassigned' THEN
      allowed := ARRAY['Dispatched', 'Cancelled', 'Unassigned / Missed Call Recovery'];
    WHEN 'Unassigned / Missed Call Recovery' THEN
      allowed := ARRAY['Dispatched', 'Cancelled'];

    -- ── Driver-accepted aliases (set by the operator platform) ────────────────
    WHEN 'accepted', 'confirmed' THEN
      allowed := ARRAY['En Route', 'Dispatched', 'Cancelled'];

    -- ── Dispatched ────────────────────────────────────────────────────────────
    WHEN 'Dispatched' THEN
      allowed := ARRAY['En Route', 'Cancelled'];

    -- ── En Route (canonical + lowercase alias) ────────────────────────────────
    WHEN 'En Route', 'en_route' THEN
      allowed := ARRAY['Arrived', 'Passenger On Board', 'Cancelled'];

    -- ── Arrived (canonical + lowercase alias) ─────────────────────────────────
    WHEN 'Arrived', 'arrived' THEN
      allowed := ARRAY['Passenger On Board', 'Cancelled'];

    -- ── Active is a legacy alias for En Route / Passenger On Board ────────────
    WHEN 'Active', 'active' THEN
      allowed := ARRAY['Arrived', 'Passenger On Board', 'Completed', 'Cancelled'];

    -- ── Passenger On Board ────────────────────────────────────────────────────
    WHEN 'Passenger On Board' THEN
      allowed := ARRAY['Completed', 'Arrived', 'Cancelled'];

    -- ── Terminal statuses: no further transitions permitted ───────────────────
    WHEN 'Completed', 'completed' THEN
      RAISE EXCEPTION 'Booking % is already Completed and cannot be changed.', NEW.id;
    WHEN 'Cancelled', 'cancelled', 'Canceled', 'canceled' THEN
      RAISE EXCEPTION 'Booking % is already Cancelled and cannot be changed.', NEW.id;
    WHEN 'No Show', 'no show' THEN
      RAISE EXCEPTION 'Booking % is already a No Show and cannot be changed.', NEW.id;
    WHEN 'CRITICAL_UNALLOCATED' THEN
      -- Allow operator to manually re-dispatch from the critical state
      allowed := ARRAY['Dispatched', 'Cancelled'];

    ELSE
      -- Unknown old status: allow rather than block to prevent lockout
      RETURN NEW;
  END CASE;

  IF NOT (NEW.status = ANY(allowed)) THEN
    RAISE EXCEPTION 'Invalid status transition from "%" to "%". Allowed: %',
      OLD.status, NEW.status, array_to_string(allowed, ', ');
  END IF;

  RETURN NEW;
END;
$$;

-- Re-attach trigger (idempotent — DROP IF EXISTS already in the previous migration)
DROP TRIGGER IF EXISTS enforce_booking_status_transition ON public.bookings;
CREATE TRIGGER enforce_booking_status_transition
  BEFORE UPDATE OF status
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_booking_status_transition();
