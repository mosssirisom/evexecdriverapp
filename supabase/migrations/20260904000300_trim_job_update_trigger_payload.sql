-- Trim notify_driver_job_update trigger payload.
--
-- The previous version sent to_jsonb(new) and to_jsonb(old) — the entire
-- booking row including customer_phone, customer_email, driver_notes, etc.
-- The edge function only needs the fields listed below to decide whether to
-- notify and what to say. Sending the minimal set reduces unnecessary data
-- exposure in pg_net request logs and the Supabase network layer.

CREATE OR REPLACE FUNCTION public.notify_driver_job_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  cancelled_statuses text[] := ARRAY['cancelled','Cancelled','canceled','Canceled'];
  is_cancelled       boolean;
  detail_changed     boolean;
  payload            jsonb;
BEGIN
  -- Only act when a driver is assigned
  IF new.assigned_driver_id IS NULL THEN
    RETURN new;
  END IF;

  is_cancelled := new.status = ANY(cancelled_statuses)
               AND NOT (old.status = ANY(cancelled_statuses));

  detail_changed := (
    new.travel_date      IS DISTINCT FROM old.travel_date     OR
    new.travel_time      IS DISTINCT FROM old.travel_time     OR
    new.pickup_location  IS DISTINCT FROM old.pickup_location OR
    new.airport          IS DISTINCT FROM old.airport         OR
    new.dropoff_address  IS DISTINCT FROM old.dropoff_address
  ) AND NOT (new.status = ANY(cancelled_statuses));

  IF NOT (is_cancelled OR detail_changed) THEN
    RETURN new;
  END IF;

  -- Send only the fields the edge function reads; do not include PII columns
  -- (customer_phone, customer_email, driver_notes, corporate_email, etc.)
  payload := jsonb_build_object(
    'record', jsonb_build_object(
      'id',                  new.id,
      'ref',                 new.ref,
      'status',              new.status,
      'assigned_driver_id',  new.assigned_driver_id,
      'customer_name',       new.customer_name,
      'travel_date',         new.travel_date,
      'travel_time',         new.travel_time,
      'pickup_location',     new.pickup_location,
      'airport',             new.airport,
      'dropoff_address',     new.dropoff_address,
      'journey_type',        new.journey_type
    ),
    'old_record', jsonb_build_object(
      'id',               old.id,
      'status',           old.status,
      'travel_date',      old.travel_date,
      'travel_time',      old.travel_time,
      'pickup_location',  old.pickup_location,
      'airport',          old.airport,
      'dropoff_address',  old.dropoff_address
    )
  );

  PERFORM net.http_post(
    url     := 'https://yoltkmhtxwluqxxpewbl.supabase.co/functions/v1/notify-job-update',
    body    := payload,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'attestation_engine_service_key' LIMIT 1
      )
    )
  );

  RETURN new;
END;
$$;

-- Trigger is already attached; replacing the function is sufficient.
-- Re-attach explicitly to be safe with the updated SECURITY DEFINER function.
DROP TRIGGER IF EXISTS trg_notify_job_update ON public.bookings;
CREATE TRIGGER trg_notify_job_update
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_driver_job_update();
