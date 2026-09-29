-- Enable pg_cron and pg_net (already available on this Supabase plan at no
-- extra cost) so the previously-written cron jobs for send-driver-reminders
-- and attestation-engine actually run. Both migrations that were meant to
-- schedule these (20260622000000, 20260904000100) silently no-op'd because
-- pg_cron was never enabled -- this fixes that. Applied directly against
-- the live project on 2026-09-22; this file exists to keep migration
-- history accurate for anyone rebuilding the project from scratch.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Seed the invocation secret used by both cron jobs' Authorization header.
-- Both edge functions have verify_jwt=false, so this header isn't required
-- to reach them, but it's kept for defense-in-depth / forward compatibility
-- if verify_jwt is ever enabled. Deliberately the anon (publishable) key,
-- not the service-role key: the functions build their own privileged
-- Supabase client internally from their own SUPABASE_SERVICE_ROLE_KEY
-- function secret, so this header only needs to be a validly-signed
-- project JWT, not a privileged one. The anon key is public by design
-- (already embedded in every client app), so it's safe to commit here.
select vault.create_secret(
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvbHRrbWh0eHdsdXF4eHBld2JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0ODMwNjgsImV4cCI6MjA5NTA1OTA2OH0.kLwJK13TsSNn4oK3NZj33awGigWfdKgPP-cbqpqrIbo',
  'attestation_engine_service_key'
)
where not exists (
  select 1 from vault.decrypted_secrets where name = 'attestation_engine_service_key'
);

do $outer$
declare
  v_project_url text := 'https://yoltkmhtxwluqxxpewbl.supabase.co';
begin
  begin
    perform cron.unschedule('attestation-engine-sweep');
  exception when others then null;
  end;

  perform cron.schedule(
    'attestation-engine-sweep',
    '* * * * *',
    format(
      $inner1$
      select net.http_post(
        url     := %L,
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'attestation_engine_service_key'
          )
        ),
        body := '{}'::jsonb
      );
      $inner1$,
      v_project_url || '/functions/v1/attestation-engine'
    )
  );

  begin
    perform cron.unschedule('driver-reminder-sweep');
  exception when others then null;
  end;

  perform cron.schedule(
    'driver-reminder-sweep',
    '* * * * *',
    format(
      $inner2$
      select net.http_post(
        url     := %L,
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'attestation_engine_service_key'
          )
        ),
        body := '{}'::jsonb
      );
      $inner2$,
      v_project_url || '/functions/v1/send-driver-reminders'
    )
  );
end $outer$;
