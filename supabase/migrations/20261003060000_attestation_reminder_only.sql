-- Reminder-only driver attestation (user decision, 2026-10-03).
--
-- The original Zero-Failure Attestation Loop migration
-- (20260610090000_driver_attestation_loop.sql) was never applied to
-- production, so attestation-engine failed on every run. It also rewrote
-- bookings_status_check / drivers_status_check with older lists (dropping
-- 'Arrived', 'accepted', 'No Show', ...) and auto-suspended / auto-reassigned
-- drivers. Neither is wanted. This adds only the columns the reminder-only
-- engine needs; attestation_status stays plain text (null = not started).
--
-- States: null/'not_required' -> 'awaiting_first_attestation' (push, 60 min
-- before pickup) -> 'awaiting_second_attestation' (urgent push, +10 min) ->
-- 'operator_alerted' (operator push + email, +5 min). 'confirmed' ends it at
-- any point, set by the driver's Confirm button or by swiping to En Route.

alter table public.bookings
  add column if not exists attestation_first_deadline  timestamptz,
  add column if not exists attestation_second_deadline timestamptz,
  add column if not exists first_attestation_sent_at   timestamptz,
  add column if not exists second_attestation_sent_at  timestamptz,
  add column if not exists operator_alerted_at         timestamptz;

create index if not exists idx_bookings_attestation_active
  on public.bookings (attestation_status)
  where attestation_status in ('awaiting_first_attestation', 'awaiting_second_attestation');
