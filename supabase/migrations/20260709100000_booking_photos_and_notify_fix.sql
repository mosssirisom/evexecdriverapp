-- ============================================================================
-- 20260709100000_booking_photos_and_notify_fix.sql
--
-- booking_photos is written to by app/(app)/jobs/[id]/page.tsx but was never
-- created by any tracked migration on main -- it exists live only via an
-- out-of-band change. Creating it for real here, defensively (IF NOT EXISTS),
-- plus a `kind` column so the operator dashboard can distinguish proof types
-- the way it used to expect from the never-populated `job_proofs` table.
--
-- Also flips bookings to REPLICA IDENTITY FULL: the driver-app's realtime
-- "new job" listener now also handles UPDATE events (dispatch is an UPDATE,
-- not an INSERT), and needs `payload.old.assigned_driver_id` to distinguish
-- "just got assigned" from "some other field on my existing job changed".
-- Without FULL identity, Postgres only sends the primary key in `old`.
-- ============================================================================

create table if not exists public.booking_photos (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  driver_id   uuid not null references public.drivers(id),
  kind        text check (kind in ('pob_photo', 'signature', 'completion_photo', 'no_show_photo')),
  url         text not null,
  caption     text,
  created_at  timestamptz not null default now()
);

alter table public.booking_photos add column if not exists kind text;
alter table public.booking_photos drop constraint if exists booking_photos_kind_check;
alter table public.booking_photos add constraint booking_photos_kind_check
  check (kind in ('pob_photo', 'signature', 'completion_photo', 'no_show_photo'));

create index if not exists idx_booking_photos_booking_id on public.booking_photos(booking_id);

alter table public.booking_photos enable row level security;

drop policy if exists booking_photos_driver_select on public.booking_photos;
drop policy if exists booking_photos_driver_insert on public.booking_photos;
drop policy if exists booking_photos_driver_delete on public.booking_photos;
drop policy if exists booking_photos_authenticated_read on public.booking_photos;

-- Drivers manage their own uploads.
create policy booking_photos_driver_insert on public.booking_photos for insert
  with check (driver_id = auth.uid());
create policy booking_photos_driver_delete on public.booking_photos for delete
  using (driver_id = auth.uid());

-- Any authenticated user (operator dashboard has no separate role model yet
-- in this single-tenant-per-deployment setup) can read proofs.
create policy booking_photos_authenticated_read on public.booking_photos for select
  to authenticated
  using (true);

alter table public.bookings replica identity full;
