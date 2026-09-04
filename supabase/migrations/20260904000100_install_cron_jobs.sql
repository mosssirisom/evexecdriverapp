-- Install pg_cron schedules for the attestation engine and driver reminders.
--
-- Previous migrations (20260610090000, 20260622000000) only documented these
-- steps as comment blocks — the SQL never actually ran. This migration
-- executes them idempotently by unscheduling first.
--
-- PREREQUISITES:
--   1. pg_cron and pg_net extensions must be enabled (Supabase Dashboard →
--      Database → Extensions, or `supabase db extensions enable pg_cron`).
--   2. The service role key must be stored in Vault under the name
--      'attestation_engine_service_key' (shared between both cron jobs).
--      If not already present:
--        select vault.create_secret('<service-role-key>', 'attestation_engine_service_key');
--   3. Both edge functions must be deployed before cron fires:
--        supabase functions deploy attestation-engine
--        supabase functions deploy send-driver-reminders

do $$
declare
  v_project_url text := 'https://yoltkmhtxwluqxxpewbl.supabase.co';
  v_cron_available boolean;
  v_net_available boolean;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_cron_available;
  select exists (select 1 from pg_extension where extname = 'pg_net')  into v_net_available;

  if not v_cron_available then
    raise notice 'pg_cron extension not installed — skipping cron job setup. Enable it in Supabase Dashboard > Database > Extensions.';
    return;
  end if;

  if not v_net_available then
    raise notice 'pg_net extension not installed — skipping cron job setup. Enable it in Supabase Dashboard > Database > Extensions.';
    return;
  end if;

  -- ── Attestation engine (every minute) ──────────────────────────────────────
  begin
    perform cron.unschedule('attestation-engine-sweep');
  exception when others then null;
  end;

  perform cron.schedule(
    'attestation-engine-sweep',
    '* * * * *',
    format(
      $$
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
      $$,
      v_project_url || '/functions/v1/attestation-engine'
    )
  );

  -- ── Driver reminders (every minute) ────────────────────────────────────────
  begin
    perform cron.unschedule('driver-reminder-sweep');
  exception when others then null;
  end;

  perform cron.schedule(
    'driver-reminder-sweep',
    '* * * * *',
    format(
      $$
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
      $$,
      v_project_url || '/functions/v1/send-driver-reminders'
    )
  );

  raise notice 'Cron jobs installed: attestation-engine-sweep, driver-reminder-sweep';
  raise notice 'Verify with: select jobname, schedule, active from cron.job;';
end $$;
