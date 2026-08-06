-- 030: Rotate the equity quotes fetch across runs.
-- Each pulse-quotes run fetches 60 symbols (1/sec) starting at a persisted
-- offset, then advances it, cycling through all 503 symbols. The cron moves
-- from every 30 minutes to every 1 minute so the full universe refreshes
-- roughly every 9-18 minutes (some runs skip while the previous fetch still
-- holds the quotes:sync lock).

-- 1. Persisted pipeline state (key/value)
create table if not exists public.pipeline_state (
  key text primary key,
  value integer not null,
  updated_at timestamptz not null default now()
);
alter table public.pipeline_state enable row level security;

revoke all on table public.pipeline_state from public, anon, authenticated;
grant select, insert, update, delete on table public.pipeline_state to service_role;

-- 2. Seed the quotes offset (idempotent; keeps an in-flight value on re-run)
insert into public.pipeline_state (key, value)
values ('quotes_offset', 0)
on conflict (key) do nothing;

-- 3. Reschedule pulse-quotes to every minute
select cron.unschedule(jobid) from cron.job where jobname = 'pulse-quotes';
select cron.schedule(
  'pulse-quotes',
  '* * * * *',
  $$
    select net.http_post(
      url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'PROJECT_URL'), '/') || '/functions/v1/pipeline?job=quotes',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET')
      ),
      body := jsonb_build_object('job', 'quotes', 'scheduled_at', now()),
      timeout_milliseconds := 90000
    );
  $$
);
