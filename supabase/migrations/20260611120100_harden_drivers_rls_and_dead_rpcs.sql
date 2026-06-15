-- Remove the dashboard_anon_all_drivers policy: it grants the public anon
-- API key full read/write (USING true / WITH CHECK true) to every row and
-- column of public.drivers. Real driver auth goes through Supabase Auth
-- (auth.users) and is already covered by drivers_select_own /
-- drivers_update_own (auth.uid() = id) and the legacy email-based policies.
-- Anyone with the public anon key could otherwise read or modify any
-- driver's record.
drop policy if exists dashboard_anon_all_drivers on public.drivers;

-- driver_accept_booking / driver_update_status are SECURITY DEFINER RPCs
-- left over from an earlier schema. They operate on status values
-- ('pending', 'accepted', 'en_route', etc.) that never occur in the live
-- bookings data, so they cannot succeed today, but they are still callable
-- by anon and authenticated (via the default PUBLIC execute grant). Revoke
-- execute from PUBLIC to remove this dead attack surface; service_role
-- keeps its explicit grant.
revoke execute on function public.driver_accept_booking(uuid, uuid) from anon, authenticated;
revoke execute on function public.driver_update_status(uuid, text, uuid) from anon, authenticated;
revoke execute on function public.driver_accept_booking(uuid, uuid) from public;
revoke execute on function public.driver_update_status(uuid, text, uuid) from public;
