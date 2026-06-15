-- handle_new_user() and notify_driver_new_booking() are SECURITY DEFINER
-- trigger functions (return type `trigger`, each attached to exactly one
-- trigger). Postgres fires triggers regardless of EXECUTE grants, but the
-- default PUBLIC execute grant also exposes them as callable RPCs at
-- /rest/v1/rpc/handle_new_user and /rest/v1/rpc/notify_driver_new_booking
-- for anon and authenticated. Revoking execute closes that RPC surface
-- without affecting the triggers themselves.

revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.notify_driver_new_booking() from anon, authenticated, public;
