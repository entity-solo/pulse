-- Store valid Supabase Anon / Service Role Key in Vault for API Gateway pass-through
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'pulse_sync_anon_key') then
    perform vault.create_secret('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqbWVwdnRjY3Bza3RlZHFtZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MzMxOTYsImV4cCI6MjEwMTQwOTE5Nn0.74R39g3_33Ww751dG-o2x18h6W', 'pulse_sync_anon_key');
  else
    update vault.secrets set secret = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqbWVwdnRjY3Bza3RlZHFtZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MzMxOTYsImV4cCI6MjEwMTQwOTE5Nn0.74R39g3_33Ww751dG-o2x18h6W' where name = 'pulse_sync_anon_key';
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
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_anon_key')
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
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_anon_key')
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
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pulse_sync_anon_key')
      ),
      body := jsonb_build_object('job', 'quotes', 'scheduled_at', now())
    );
  $$
);
