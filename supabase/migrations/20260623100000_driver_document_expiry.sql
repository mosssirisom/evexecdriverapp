ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS license_expiry   date,
  ADD COLUMN IF NOT EXISTS dbs_expiry       date,
  ADD COLUMN IF NOT EXISTS pcol_expiry      date;
