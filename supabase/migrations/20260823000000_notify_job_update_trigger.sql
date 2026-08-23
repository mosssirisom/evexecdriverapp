-- Trigger: notify driver when booking is cancelled or key details change
--
-- Fires an HTTP call to the notify-job-update edge function via pg_net
-- whenever an assigned booking has its status set to cancelled,
-- or when travel_date / travel_time / pickup_location / airport /
-- dropoff_address changes while a driver is still assigned.

create or replace function notify_driver_job_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cancelled_statuses text[] := array['cancelled','Cancelled','canceled','Canceled'];
  is_cancelled       boolean;
  detail_changed     boolean;
  payload            jsonb;
  fn_url             text;
begin
  -- Only act when a driver is assigned
  if new.assigned_driver_id is null then
    return new;
  end if;

  is_cancelled := new.status = any(cancelled_statuses)
               and not (old.status = any(cancelled_statuses));

  detail_changed := (
    new.travel_date      is distinct from old.travel_date     or
    new.travel_time      is distinct from old.travel_time     or
    new.pickup_location  is distinct from old.pickup_location or
    new.airport          is distinct from old.airport         or
    new.dropoff_address  is distinct from old.dropoff_address
  ) and not (new.status = any(cancelled_statuses));

  if not (is_cancelled or detail_changed) then
    return new;
  end if;

  fn_url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_functions_url' limit 1);
  if fn_url is null then
    fn_url := current_setting('app.supabase_functions_url', true);
  end if;
  if fn_url is null then
    fn_url := 'https://' || current_setting('app.supabase_project_ref', true) || '.supabase.co/functions/v1';
  end if;

  payload := jsonb_build_object(
    'record',     to_jsonb(new),
    'old_record', to_jsonb(old)
  );

  perform net.http_post(
    url     := fn_url || '/notify-job-update',
    body    := payload,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_job_update on bookings;

create trigger trg_notify_job_update
  after update on bookings
  for each row
  execute function notify_driver_job_update();
