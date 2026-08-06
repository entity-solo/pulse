-- 028: Restore the pipeline cron jobs, now pointing at the Next.js routes on
-- Vercel instead of the retired Deno sync function (027). Nothing is hardcoded:
-- VERCEL_URL and CRON_SECRET are read from Vault when each job fires, so the
-- vault secrets named VERCEL_URL and CRON_SECRET must exist before these jobs
-- run (they are not created here because their values are operator-owned).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Job 1: pulse-ingest — news ingest every 15 minutes
select cron.unschedule(jobid) from cron.job where jobname = 'pulse-ingest';
select cron.schedule(
  'pulse-ingest',
  '*/15 * * * *',
  $$
    select net.http_post(
      url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'VERCEL_URL'), '/') || '/api/cron/ingest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET')
      ),
      body := jsonb_build_object('job', 'ingest', 'scheduled_at', now()),
      timeout_milliseconds := 60000
    );
  $$
);

-- Job 2: pulse-analyze — pipeline:analyze every 15 minutes, offset by 5
select cron.unschedule(jobid) from cron.job where jobname = 'pulse-analyze';
select cron.schedule(
  'pulse-analyze',
  '5-59/15 * * * *',
  $$
    select net.http_post(
      url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'VERCEL_URL'), '/') || '/api/cron/analyze',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET')
      ),
      body := jsonb_build_object('job', 'analyze', 'scheduled_at', now()),
      timeout_milliseconds := 60000
    );
  $$
);

-- Job 3: pulse-quotes — quote sync every 30 minutes
select cron.unschedule(jobid) from cron.job where jobname = 'pulse-quotes';
select cron.schedule(
  'pulse-quotes',
  '*/30 * * * *',
  $$
    select net.http_post(
      url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'VERCEL_URL'), '/') || '/api/cron/quotes',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET')
      ),
      body := jsonb_build_object('job', 'quotes', 'scheduled_at', now()),
      timeout_milliseconds := 60000
    );
  $$
);

-- Job 4: pulse-gc — housekeeping once a day at 02:00
select cron.unschedule(jobid) from cron.job where jobname = 'pulse-gc';
select cron.schedule(
  'pulse-gc',
  '0 2 * * *',
  $$
    select net.http_post(
      url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'VERCEL_URL'), '/') || '/api/cron/gc',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET')
      ),
      body := jsonb_build_object('job', 'gc', 'scheduled_at', now()),
      timeout_milliseconds := 60000
    );
  $$
);
