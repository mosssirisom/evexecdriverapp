begin;

-- Widen driver_sms_reminders.reminder_type to include 'completed', for the
-- journey-receipt SMS handoff replacing send-journey-receipt's direct
-- Twilio fallback (the passenger receipt, sent when the driver marks a
-- journey Completed and there's no customer_email on file). Same pattern
-- as en_route/arrived/cancelled: the assigned driver reviews and sends the
-- receipt text themselves via the native Messages app.

alter table public.driver_sms_reminders drop constraint driver_sms_reminders_reminder_type_check;
alter table public.driver_sms_reminders add constraint driver_sms_reminders_reminder_type_check
  check (reminder_type in ('7day', '24hr', 'en_route', 'arrived', 'cancelled', 'completed'));

commit;
