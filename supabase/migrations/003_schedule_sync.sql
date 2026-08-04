-- Supabase Edge Function schedule. Set the two Vault secrets before applying:
-- pulse_sync_project_url and pulse_sync_cron_secret.
select cron.unschedule(jobid) from cron.job where jobname = 'pulse-sync-every-15-minutes';
select cron.schedule(
  'pulse-sync-every-15-minutes',
  '*/15 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'pulse_sync_project_url') || '/functions/v1/sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-pulse-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'pulse_sync_cron_secret')
      ),
      body := jsonb_build_object('scheduled_at', now())
    );
  $$
);