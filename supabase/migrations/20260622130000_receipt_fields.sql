-- Phase 4: Receipt automation fields
--
-- corporate_email: billing contact to receive the driver invoice (separate from
--   the passenger's customer_email)
-- receipt_sent_at: stamped when send-journey-receipt fires successfully so the
--   app can show "Receipt sent" and avoid duplicate sends

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS corporate_email  text,
  ADD COLUMN IF NOT EXISTS receipt_sent_at  timestamptz;
