-- Fix enforce_booking_status_transition to include the Arrived step.
-- The original trigger blocked En Route → Arrived and didn't handle
-- Arrived as a source status. Also adds Arrived to the Passenger On Board
-- allowed set so the 5-second undo button can revert correctly.

CREATE OR REPLACE FUNCTION public.enforce_booking_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  allowed text[];
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  CASE OLD.status
    WHEN 'Unassigned' THEN
      allowed := ARRAY['Dispatched', 'Cancelled', 'Unassigned / Missed Call Recovery'];
    WHEN 'Unassigned / Missed Call Recovery' THEN
      allowed := ARRAY['Dispatched', 'Cancelled'];
    WHEN 'Dispatched' THEN
      allowed := ARRAY['En Route', 'Cancelled'];
    WHEN 'En Route' THEN
      allowed := ARRAY['Arrived', 'Passenger On Board', 'Cancelled'];
    WHEN 'Arrived' THEN
      allowed := ARRAY['Passenger On Board', 'Cancelled'];
    WHEN 'Passenger On Board' THEN
      allowed := ARRAY['Completed', 'Arrived', 'Cancelled'];
    WHEN 'Completed' THEN
      allowed := ARRAY[]::text[];
    WHEN 'Cancelled' THEN
      allowed := ARRAY[]::text[];
    ELSE
      RETURN NEW;
  END CASE;

  IF NOT (NEW.status = ANY(allowed)) THEN
    RAISE EXCEPTION 'Invalid status transition: % to %. Allowed: %',
      OLD.status, NEW.status, array_to_string(allowed, ', ');
  END IF;

  RETURN NEW;
END;
$function$
