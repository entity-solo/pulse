-- Enable required extensions
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Create vault secrets via Vault helper functions
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'pulse_sync_project_url') then
    perform vault.create_secret('https://sjmepvtccpsktedqmgfl.supabase.co', 'pulse_sync_project_url');
  end if;

  if not exists (select 1 from vault.decrypted_secrets where name = 'pulse_sync_cron_secret') then
    perform vault.create_secret('pulse-cron-secret-2024', 'pulse_sync_cron_secret');
  end if;
end $$;

-- Job 1: news:ingest (every 15 minutes: */15 * * * *)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'pulse-sync-ingest-every-15-minutes';
SELECT cron.schedule(
  'pulse-sync-ingest-every-15-minutes',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_project_url') || '/functions/v1/sync?job=ingest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-pulse-cron', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_cron_secret'),
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_cron_secret')
      ),
      body := jsonb_build_object('job', 'ingest', 'scheduled_at', now())
    );
  $$
);

-- Job 2: pipeline:analyze (every 15 minutes offset by 2 minutes: 2-57/15 * * * *)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'pulse-sync-analyze-every-15-minutes';
SELECT cron.schedule(
  'pulse-sync-analyze-every-15-minutes',
  '2-57/15 * * * *',
  $$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_project_url') || '/functions/v1/sync?job=analyze',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-pulse-cron', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_cron_secret'),
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_cron_secret')
      ),
      body := jsonb_build_object('job', 'analyze', 'scheduled_at', now())
    );
  $$
);

-- Job 3: quotes:sync (every 30 minutes: */30 * * * *)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'pulse-sync-quotes-every-30-minutes';
SELECT cron.schedule(
  'pulse-sync-quotes-every-30-minutes',
  '*/30 * * * *',
  $$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_project_url') || '/functions/v1/sync?job=quotes',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-pulse-cron', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_cron_secret'),
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_cron_secret')
      ),
      body := jsonb_build_object('job', 'quotes', 'scheduled_at', now())
    );
  $$
);
