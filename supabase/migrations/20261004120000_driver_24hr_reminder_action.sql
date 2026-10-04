-- 24hr customer reminder sent by the driver from the job screen.
-- Additive only:
--  * reminder_type also accepts '24hr_return' (the return leg lives on the
--    same booking row as the outbound one, so it needs its own row).
--  * Drivers may insert their own reminder rows (until now only the website's
--    reminder cron, using the service role, created them). The row must be for
--    the signed-in driver and a booking assigned to them.

alter table public.driver_sms_reminders
  drop constraint if exists driver_sms_reminders_reminder_type_check;
alter table public.driver_sms_reminders
  add constraint driver_sms_reminders_reminder_type_check
  check (reminder_type in ('7day', '24hr', '24hr_return', 'en_route', 'arrived', 'cancelled'));

drop policy if exists driver_insert_own_sms_reminders on public.driver_sms_reminders;
create policy driver_insert_own_sms_reminders on public.driver_sms_reminders
  for insert to authenticated
  with check (
    driver_id = (select auth.uid())
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.assigned_driver_id = (select auth.uid())
        and b.tenant_id = driver_sms_reminders.tenant_id
    )
  );
