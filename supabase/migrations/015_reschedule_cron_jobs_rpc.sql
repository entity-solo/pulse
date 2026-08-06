-- RPC function to unschedule and reschedule all cron jobs with Vault secrets and 60s pg_net timeout
create or replace function reschedule_all_cron_jobs(
  anon_key text,
  cron_secret text,
  project_url text
)
returns text
language plpgsql
security definer
as $$
begin
  -- 1. Unschedule all existing jobs
  perform cron.unschedule(jobid) from cron.job where jobname like 'pulse-sync-%' or jobname is null;

  -- 2. Reschedule Job 1: ingest (every 15 minutes: */15 * * * *)
  perform cron.schedule(
    'pulse-sync-ingest-every-15-minutes',
    '*/15 * * * *',
    format($cmd$
      SELECT net.http_post(
        url := '%s/functions/v1/sync?job=ingest',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-pulse-cron', '%s',
          'Authorization', 'Bearer %s'
        ),
        body := jsonb_build_object('job', 'ingest', 'scheduled_at', now()),
        timeout_milliseconds := 60000
      );
    $cmd$, project_url, cron_secret, anon_key)
  );

  -- 3. Reschedule Job 2: analyze (every 15 minutes offset by 2 minutes: 2-57/15 * * * *)
  perform cron.schedule(
    'pulse-sync-analyze-every-15-minutes',
    '2-57/15 * * * *',
    format($cmd$
      SELECT net.http_post(
        url := '%s/functions/v1/sync?job=analyze',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-pulse-cron', '%s',
          'Authorization', 'Bearer %s'
        ),
        body := jsonb_build_object('job', 'analyze', 'scheduled_at', now()),
        timeout_milliseconds := 60000
      );
    $cmd$, project_url, cron_secret, anon_key)
  );

  -- 4. Reschedule Job 3: quotes (every 30 minutes: */30 * * * *)
  perform cron.schedule(
    'pulse-sync-quotes-every-30-minutes',
    '*/30 * * * *',
    format($cmd$
      SELECT net.http_post(
        url := '%s/functions/v1/sync?job=quotes',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-pulse-cron', '%s',
          'Authorization', 'Bearer %s'
        ),
        body := jsonb_build_object('job', 'quotes', 'scheduled_at', now()),
        timeout_milliseconds := 60000
      );
    $cmd$, project_url, cron_secret, anon_key)
  );

  return 'OK';
end;
$$;
