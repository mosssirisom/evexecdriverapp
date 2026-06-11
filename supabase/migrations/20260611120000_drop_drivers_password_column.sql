-- The anon role has full read/write access to public.drivers via the
-- dashboard_anon_all_drivers policy (USING true / WITH CHECK true), which
-- means the public anon API key can read and overwrite this column for any
-- driver. Real authentication already goes through Supabase Auth
-- (auth.users); this column is an unused/leftover plaintext password store
-- and must not exist.
alter table public.drivers drop column if exists password;
