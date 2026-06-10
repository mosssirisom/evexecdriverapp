-- Zero-Failure Driver Attestation Loop
--
-- Adds the schema needed to force an allocated driver to explicitly confirm
-- readiness ahead of a pickup, automatically escalate (urgent notification),
-- automatically reallocate to the next available driver if the first driver
-- never confirms, and finally raise an operator panic if no driver confirms.
--
-- check_time = pickup_time - drive_duration_minutes - attestation_buffer_minutes
--
-- State machine (bookings.attestation_status):
--   not_required               -> default / no pickup_time or already handled
--   awaiting_first_attestation -> gate 1 fired, waiting up to attestation_first_gate_minutes
--   awaiting_second_attestation-> gate 1 timed out, urgent gate fired, waiting up to
--                                  attestation_second_gate_minutes
--   confirmed                  -> driver tapped "I'm Ready" (driver_confirmed_at set)
--   reallocating               -> transient, set while the engine looks for a new driver
--   critical_unallocated       -> SYSTEM_PANIC, no driver confirmed / none available

-- ---------------------------------------------------------------------------
-- 1. Attestation status enum
-- ---------------------------------------------------------------------------
do $$
begin
  create type attestation_status_type as enum (
    'not_required',
    'awaiting_first_attestation',
    'awaiting_second_attestation',
    'confirmed',
    'reallocating',
    'critical_unallocated'
  );
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. bookings: attestation tracking columns
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists attestation_status attestation_status_type not null default 'not_required',
  add column if not exists check_time timestamptz,
  add column if not exists drive_duration_minutes integer not null default 30,
  add column if not exists attestation_buffer_minutes integer not null default 30,
  add column if not exists attestation_first_gate_minutes integer not null default 10,
  add column if not exists attestation_second_gate_minutes integer not null default 5,
  add column if not exists attestation_first_deadline timestamptz,
  add column if not exists attestation_second_deadline timestamptz,
  add column if not exists first_attestation_sent_at timestamptz,
  add column if not exists second_attestation_sent_at timestamptz,
  add column if not exists driver_confirmed_at timestamptz,
  add column if not exists reallocation_count integer not null default 0,
  add column if not exists excluded_driver_ids uuid[] not null default '{}',
  -- Optional pickup coordinates for geo-based reallocation. Nullable because
  -- existing bookings have no geocoded pickup point; the dispatch helper
  -- degrades gracefully (falls back to driver rating) when these are null.
  add column if not exists pickup_lat double precision,
  add column if not exists pickup_lng double precision;

alter table public.bookings
  add constraint bookings_drive_duration_minutes_check check (drive_duration_minutes > 0),
  add constraint bookings_attestation_buffer_minutes_check check (attestation_buffer_minutes >= 0),
  add constraint bookings_attestation_first_gate_minutes_check check (attestation_first_gate_minutes > 0),
  add constraint bookings_attestation_second_gate_minutes_check check (attestation_second_gate_minutes > 0),
  add constraint bookings_reallocation_count_check check (reallocation_count >= 0);

comment on column public.bookings.attestation_status is 'Zero-Failure Attestation Loop state machine status';
comment on column public.bookings.check_time is 'pickup_time - drive_duration_minutes - attestation_buffer_minutes; computed by trg_bookings_set_check_time';
comment on column public.bookings.attestation_first_gate_minutes is 'Minutes the assigned driver has to confirm after gate 1 fires before gate 2 (urgent) fires. Compressed to a smaller value after reallocation.';
comment on column public.bookings.attestation_second_gate_minutes is 'Minutes the assigned driver has to confirm after gate 2 (urgent) fires before reallocation. Compressed to a smaller value after reallocation.';
comment on column public.bookings.excluded_driver_ids is 'Drivers who have already failed/been excluded from this booking and must not be re-offered it.';

-- ---------------------------------------------------------------------------
-- 3. bookings.status: allow the operator-panic terminal state
-- ---------------------------------------------------------------------------
alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status = any (array[
    'Unassigned',
    'Dispatched',
    'En Route',
    'Passenger On Board',
    'Completed',
    'Cancelled',
    'Unassigned / Missed Call Recovery',
    'CRITICAL_UNALLOCATED'
  ]));

-- ---------------------------------------------------------------------------
-- 4. drivers: suspension + last-known-location columns
-- ---------------------------------------------------------------------------
alter table public.drivers
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text,
  add column if not exists current_lat double precision,
  add column if not exists current_lng double precision,
  add column if not exists location_updated_at timestamptz;

comment on column public.drivers.suspended_at is 'Set by the attestation engine when a driver fails to confirm both gates. Requires operator manual reset (clear suspended_at/suspended_reason and set status back to Available).';

alter table public.drivers drop constraint if exists drivers_status_check;
alter table public.drivers add constraint drivers_status_check
  check (status = any (array[
    'Available',
    'Available soon',
    'En route',
    'Passenger onboard',
    'Off duty',
    'Suspended'
  ]));

-- ---------------------------------------------------------------------------
-- 5. check_time trigger
--
-- Recomputes check_time whenever pickup_time or the duration/buffer columns
-- change. Deliberately does NOT touch attestation_status — re-arming the
-- attestation loop after a manual reassignment/reschedule is handled by the
-- operator app, to avoid racing with the attestation-engine's own writes
-- during a reallocation cascade.
-- ---------------------------------------------------------------------------
create or replace function public.bookings_set_check_time()
returns trigger
language plpgsql
as $$
begin
  if new.pickup_time is not null then
    new.check_time := new.pickup_time
      - make_interval(mins => coalesce(new.drive_duration_minutes, 30))
      - make_interval(mins => coalesce(new.attestation_buffer_minutes, 30));
  else
    new.check_time := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bookings_set_check_time on public.bookings;
create trigger trg_bookings_set_check_time
  before insert or update of pickup_time, drive_duration_minutes, attestation_buffer_minutes
  on public.bookings
  for each row
  execute function public.bookings_set_check_time();

-- Backfill check_time for existing rows that already have a pickup_time.
update public.bookings
set check_time = pickup_time
  - make_interval(mins => coalesce(drive_duration_minutes, 30))
  - make_interval(mins => coalesce(attestation_buffer_minutes, 30))
where pickup_time is not null
  and check_time is null;

-- ---------------------------------------------------------------------------
-- 6. Indexes for the per-minute attestation-engine sweep
-- ---------------------------------------------------------------------------
create index if not exists idx_bookings_attestation_status
  on public.bookings (attestation_status)
  where attestation_status <> 'not_required';

create index if not exists idx_bookings_check_time_pending
  on public.bookings (check_time)
  where attestation_status = 'not_required' and check_time is not null;

create index if not exists idx_bookings_attestation_first_deadline
  on public.bookings (attestation_first_deadline)
  where attestation_status = 'awaiting_first_attestation';

create index if not exists idx_bookings_attestation_second_deadline
  on public.bookings (attestation_second_deadline)
  where attestation_status = 'awaiting_second_attestation';

create index if not exists idx_drivers_status_online
  on public.drivers (status, is_online);

-- ---------------------------------------------------------------------------
-- 7. MANUAL DEPLOYMENT STEP — per-minute scheduler
--
-- The block below is NOT executed by this migration. It documents how to
-- wire up pg_cron + pg_net to invoke the `attestation-engine` edge function
-- every minute once it has been deployed. Run this manually (e.g. via the
-- SQL editor) after:
--   1. `supabase functions deploy attestation-engine`
--   2. Storing the project's service role key in Vault (so it isn't stored
--      in plain text inside pg_cron.job).
--
-- create extension if not exists pg_cron with schema extensions;
-- create extension if not exists pg_net with schema extensions;
--
-- select vault.create_secret('<service-role-key>', 'attestation_engine_service_key');
--
-- select cron.schedule(
--   'attestation-engine-sweep',
--   '* * * * *', -- every minute
--   $$
--   select net.http_post(
--     url := 'https://yoltkmhtxwluqxxpewbl.supabase.co/functions/v1/attestation-engine',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'attestation_engine_service_key')
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
-- ---------------------------------------------------------------------------
