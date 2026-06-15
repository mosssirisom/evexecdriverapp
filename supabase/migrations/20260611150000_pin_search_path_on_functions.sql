-- Pin a fixed search_path on SECURITY DEFINER / trigger functions flagged by
-- the Supabase linter (function_search_path_mutable). Without this, these
-- functions resolve unqualified identifiers using the caller's search_path,
-- which could be hijacked by a role that can create objects in a schema
-- earlier in that path. None of these functions reference anything outside
-- public/pg_catalog, so pinning search_path is behavior-preserving.

alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.update_updated_at() set search_path = public, pg_temp;
alter function public.enforce_booking_status_transition() set search_path = public, pg_temp;
alter function public.prevent_driver_double_booking() set search_path = public, pg_temp;
alter function public.sync_assigned_driver_id() set search_path = public, pg_temp;
alter function public.driver_accept_booking(uuid, uuid) set search_path = public, pg_temp;
alter function public.driver_update_status(uuid, text, uuid) set search_path = public, pg_temp;
