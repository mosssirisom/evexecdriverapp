-- Driver Events table for targeted realtime notifications
--
-- Replaces the unfiltered bookings UPDATE subscription in job-notifier.tsx.
-- Instead of broadcasting every booking update to every connected driver,
-- a DB trigger writes a driver-specific row to this table. The client
-- subscribes with filter: driver_id=eq.{user.id} so only that driver's
-- own events are delivered.
--
-- RLS ensures a driver can only read their own events, even if they craft
-- a subscription without the filter.

create table if not exists public.driver_events (
  id         bigint generated always as identity primary key,
  driver_id  uuid not null references public.drivers (id) on delete cascade,
  event_type text not null,
  payload    jsonb,
  created_at timestamptz not null default now()
);

comment on table public.driver_events is
  'Targeted driver notification events written by DB triggers and consumed via Supabase Realtime.';

alter table public.driver_events enable row level security;

-- Each driver sees only their own events
create policy "driver_events_select_own"
  on public.driver_events
  for select
  using (driver_id = auth.uid());

-- Only the service role may insert (done by trigger function, SECURITY DEFINER)
create policy "driver_events_insert_service"
  on public.driver_events
  for insert
  with check (false); -- blocked for all roles; SECURITY DEFINER trigger bypasses this

-- Enable realtime for driver_events
alter publication supabase_realtime add table public.driver_events;

-- Index for the per-driver Realtime filter
create index if not exists idx_driver_events_driver_id
  on public.driver_events (driver_id, created_at desc);

-- ─── Trigger: insert a driver_event when a driver is unassigned ──────────────

create or replace function public.trg_fn_notify_driver_unassigned()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Fire only when assigned_driver_id changes away from a real driver
  if old.assigned_driver_id is not null and (
    new.assigned_driver_id is null or
    new.assigned_driver_id <> old.assigned_driver_id
  ) then
    insert into public.driver_events (driver_id, event_type, payload)
    values (
      old.assigned_driver_id,
      'booking_unassigned',
      jsonb_build_object(
        'booking_id',   new.id,
        'ref',          new.ref,
        'customer_name', new.customer_name
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_driver_unassigned on public.bookings;
create trigger trg_notify_driver_unassigned
  after update of assigned_driver_id
  on public.bookings
  for each row
  execute function public.trg_fn_notify_driver_unassigned();

-- ─── Cleanup: auto-delete events older than 24 hours ─────────────────────────
-- This keeps the table from growing unboundedly. pg_cron fires it hourly.
-- (Safe to skip if pg_cron is not enabled — old rows cost very little storage.)

do $$
begin
  if exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) then
    perform cron.unschedule('driver-events-cleanup');
  end if;
exception when others then null;
end $$;

do $$
begin
  if exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) then
    perform cron.schedule(
      'driver-events-cleanup',
      '0 * * * *', -- hourly
      $$delete from public.driver_events where created_at < now() - interval '24 hours'$$
    );
  end if;
exception when others then null;
end $$;
