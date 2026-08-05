-- Supabase Edge Function schedule for 3 independent jobs:
-- Set Vault secrets before applying: pulse_sync_project_url and pulse_sync_cron_secret.

-- Job 1: quotes:sync (every 15 minutes)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'pulse-sync-quotes-every-15-minutes';
SELECT cron.schedule(
  'pulse-sync-quotes-every-15-minutes',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_project_url') || '/functions/v1/sync?job=quotes',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-pulse-cron', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_cron_secret')
      ),
      body := jsonb_build_object('job', 'quotes', 'scheduled_at', now())
    );
  $$
);

-- Job 2: news:ingest (every 15 minutes)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'pulse-sync-ingest-every-15-minutes';
SELECT cron.schedule(
  'pulse-sync-ingest-every-15-minutes',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_project_url') || '/functions/v1/sync?job=ingest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-pulse-cron', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_cron_secret')
      ),
      body := jsonb_build_object('job', 'ingest', 'scheduled_at', now())
    );
  $$
);

-- Job 3: pipeline:analyze (every 15 minutes, offset 1 minute: 1-56/15 * * * *)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'pulse-sync-analyze-every-15-minutes';
SELECT cron.schedule(
  'pulse-sync-analyze-every-15-minutes',
  '1-56/15 * * * *',
  $$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_project_url') || '/functions/v1/sync?job=analyze',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-pulse-cron', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_cron_secret')
      ),
      body := jsonb_build_object('job', 'analyze', 'scheduled_at', now())
    );
  $$
);