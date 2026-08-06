-- Set 1-minute schedule temporarily on all 3 jobs to verify immediate 200 OK responses
SELECT cron.schedule(
  'pulse-sync-ingest-every-15-minutes',
  '* * * * *',
  format($cmd$
    SELECT net.http_post(
      url := 'https://sjmepvtccpsktedqmgfl.supabase.co/functions/v1/sync?job=ingest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-pulse-cron', 'pulse-cron-secret-2024',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_anon_key')
      ),
      body := jsonb_build_object('job', 'ingest', 'scheduled_at', now()),
      timeout_milliseconds := 60000
    );
  $cmd$)
);

SELECT cron.schedule(
  'pulse-sync-analyze-every-15-minutes',
  '* * * * *',
  format($cmd$
    SELECT net.http_post(
      url := 'https://sjmepvtccpsktedqmgfl.supabase.co/functions/v1/sync?job=analyze',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-pulse-cron', 'pulse-cron-secret-2024',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_anon_key')
      ),
      body := jsonb_build_object('job', 'analyze', 'scheduled_at', now()),
      timeout_milliseconds := 60000
    );
  $cmd$)
);
