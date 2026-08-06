-- Reschedule all 3 jobs with static string literals for API Gateway pass-through (bypassing Vault view RLS in pg_cron background worker context)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname LIKE 'pulse-sync-%' OR jobname IS NULL;

-- Job 1: news:ingest (every 15 minutes: */15 * * * *)
SELECT cron.schedule(
  'pulse-sync-ingest-every-15-minutes',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://sjmepvtccpsktedqmgfl.supabase.co/functions/v1/sync?job=ingest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-pulse-cron', 'pulse-cron-secret-2024',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqbWVwdnRjY3Bza3RlZHFtZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MzMxOTYsImV4cCI6MjEwMTQwOTE5Nn0.74R39g3_33Ww751dG-o2x18h6W'
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
      url := 'https://sjmepvtccpsktedqmgfl.supabase.co/functions/v1/sync?job=analyze',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-pulse-cron', 'pulse-cron-secret-2024',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqbWVwdnRjY3Bza3RlZHFtZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MzMxOTYsImV4cCI6MjEwMTQwOTE5Nn0.74R39g3_33Ww751dG-o2x18h6W'
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
      url := 'https://sjmepvtccpsktedqmgfl.supabase.co/functions/v1/sync?job=quotes',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-pulse-cron', 'pulse-cron-secret-2024',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqbWVwdnRjY3Bza3RlZHFtZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MzMxOTYsImV4cCI6MjEwMTQwOTE5Nn0.74R39g3_33Ww751dG-o2x18h6W'
      ),
      body := jsonb_build_object('job', 'quotes', 'scheduled_at', now()),
      timeout_milliseconds := 60000
    );
  $$
);
