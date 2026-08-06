-- 025: article_cache queue state machine + pipeline single-flight locks
-- Replaces the "select then delete on failure" classify flow with a durable
-- queue: pending -> claiming -> done | none | failed, plus run-level locks so
-- overlapping cron invocations cannot double-process articles or hammer APIs.

-- 1. Queue state machine columns
alter table public.article_cache
  add column if not exists status text not null default 'pending',
  add column if not exists claimed_at timestamptz,
  add column if not exists last_error text;

-- 2. Backfill existing rows (idempotent)
update public.article_cache
set status = case
  when classified_at is not null then 'done'
  when classification_attempted_at is not null then 'none'
  else 'pending'
end
where status = 'pending';

-- 3. Claim lookup + stale-claim reclaim indexes
create index if not exists article_cache_claim_idx
  on public.article_cache (published_at desc)
  where status in ('pending', 'claiming', 'failed', 'none');

create index if not exists article_cache_claimed_at_idx
  on public.article_cache (status, claimed_at)
  where claimed_at is not null;

-- 4. Single-flight run locks
create table if not exists public.pipeline_locks (
  job text primary key,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  run_id text
);
alter table public.pipeline_locks enable row level security;

create or replace function public.acquire_pipeline_lock(p_job text, p_lock_seconds int default 900)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  insert into public.pipeline_locks (job, acquired_at, expires_at, run_id)
  values (p_job, v_now, v_now + make_interval(secs => p_lock_seconds), gen_random_uuid()::text)
  on conflict (job) do update
    set acquired_at = v_now, expires_at = v_now + make_interval(secs => p_lock_seconds), run_id = excluded.run_id
    where public.pipeline_locks.expires_at < v_now;
  return found;
end;
$$;

create or replace function public.release_pipeline_lock(p_job text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.pipeline_locks where job = p_job;
$$;

-- 5. Atomic claim of unclassified articles
create or replace function public.claim_unclassified_articles(
  p_window_hours int,
  p_max int,
  p_claim_timeout_min int default 30,
  p_failed_retry_min int default 60,
  p_none_retry_hours int default 24
)
returns table (url text, headline text, summary text, outlet text, published_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  return query
  update public.article_cache a
  set status = 'claiming', claimed_at = v_now, updated_at = v_now
  where a.url in (
    select b.url
    from public.article_cache b
    where b.classified_at is null
      and b.expires_at > v_now
      and b.published_at > v_now - make_interval(hours => p_window_hours)
      and (
        b.status = 'pending'
        or (b.status = 'claiming' and b.claimed_at < v_now - make_interval(mins => p_claim_timeout_min))
        or (b.status = 'failed' and b.classification_attempted_at < v_now - make_interval(mins => p_failed_retry_min))
        or (b.status = 'none' and b.classification_attempted_at < v_now - make_interval(hours => p_none_retry_hours))
      )
    order by b.published_at desc
    limit p_max
  )
  returning a.url, a.headline, a.summary, a.outlet, a.published_at;
end;
$$;

-- 6. Restrict the RPCs to the service role (the sync function's DB client)
revoke all on function public.acquire_pipeline_lock(text, int) from public, anon, authenticated;
revoke all on function public.release_pipeline_lock(text) from public, anon, authenticated;
revoke all on function public.claim_unclassified_articles(int, int, int, int, int) from public, anon, authenticated;
grant execute on function public.acquire_pipeline_lock(text, int) to service_role;
grant execute on function public.release_pipeline_lock(text) to service_role;
grant execute on function public.claim_unclassified_articles(int, int, int, int, int) to service_role;

-- 7. Allow 'skipped' as an ingest_runs status (single-flight no-op runs)
alter table public.ingest_runs drop constraint if exists ingest_runs_status_check;
alter table public.ingest_runs add constraint ingest_runs_status_check check (status in ('ok', 'partial', 'error', 'skipped'));
