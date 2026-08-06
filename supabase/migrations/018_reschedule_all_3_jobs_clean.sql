-- Reschedule all 3 jobs cleanly with timeout_milliseconds := 60000 and dynamic Vault secret decryption
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname LIKE 'pulse-sync-%' OR jobname IS NULL;

-- Job 1: news:ingest (every 15 minutes: */15 * * * *)
SELECT cron.schedule(
  'pulse-sync-ingest-every-15-minutes',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_project_url') || '/functions/v1/sync?job=ingest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-pulse-cron', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_cron_secret'),
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_anon_key')
      ),
      body := jsonb_build_object('job', 'ingest', 'scheduled_at', now()),
      timeout_milliseconds := 60000
    );
  $$
);

-- Job 2: pipeline:analyze (every 15 minutes offset by 2 minutes: 2-57/15 * * * *)
SELECT cron.schedule(
  'pulse-sync-analyze-every-15-minutes',
  '2-57/15 * * * *',
  $$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_project_url') || '/functions/v1/sync?job=analyze',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-pulse-cron', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_cron_secret'),
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_anon_key')
      ),
      body := jsonb_build_object('job', 'analyze', 'scheduled_at', now()),
      timeout_milliseconds := 60000
    );
  $$
);

-- Job 3: quotes:sync (every 30 minutes: */30 * * * *)
SELECT cron.schedule(
  'pulse-sync-quotes-every-30-minutes',
  '*/30 * * * *',
  $$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_project_url') || '/functions/v1/sync?job=quotes',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-pulse-cron', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_cron_secret'),
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_anon_key')
      ),
      body := jsonb_build_object('job', 'quotes', 'scheduled_at', now()),
      timeout_milliseconds := 60000
    );
  $$
);
