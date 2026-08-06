-- 026: pipeline rejection log + persistent cluster state machine
--
-- Adds NEW tables only. Existing schema (tickers, stories, story_sources,
-- article_cache, watchlist, ingest_runs, pipeline_locks) is deliberately
-- untouched. article_cache already carries the queue columns from 025
-- (status, claimed_at, last_error) and the embedding/cluster_id columns from
-- 007; this migration only adds what is missing for the anchor-filter +
-- open-cluster flow described in the pipeline spec.

create extension if not exists vector;

-- 1. Rejection log (Step 2 of the analyze job).
--    Every article the filter drops as irrelevant is written here BEFORE the
--    row is deleted from article_cache. Columns are the ones required by the
--    spec plus `score` (best anchor cosine similarity) and `anchor` so the
--    0.7 / 0.5 thresholds can later be tuned from real rejection data.
create table if not exists public.article_rejections (
  url text primary key,
  headline text not null,
  outlet text not null,
  published_at timestamptz not null,
  reason text not null,
  score numeric(6,4),
  anchor text,
  rejected_at timestamptz not null default now()
);

create index if not exists article_rejections_rejected_at_idx on public.article_rejections (rejected_at desc);
create index if not exists article_rejections_published_at_idx on public.article_rejections (published_at desc);
create index if not exists article_rejections_reason_idx on public.article_rejections (reason);

alter table public.article_rejections enable row level security;

-- 2. Cluster state machine (Steps 3 & 4 of the analyze job).
--    Open clusters must survive across the 15-minute runs, so they cannot
--    live only in memory. A cluster becomes stable when it has >= N articles
--    or has been idle for M minutes; stable clusters are analyzed once by
--    Groq and the result is written to `stories` (story_id links back).
--    Member urls are tracked here so no new column is needed on article_cache.
create table if not exists public.pipeline_clusters (
  id uuid primary key default gen_random_uuid(),
  story_id uuid references public.stories(id) on delete set null,
  key text not null unique,
  status text not null default 'open'
    check (status in ('open', 'stable', 'analyzing', 'done', 'failed', 'merged')),
  title text,
  member_urls jsonb not null default '[]'::jsonb,
  centroid vector(384),
  article_count int not null default 0,
  first_seen_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  last_analysis_at timestamptz,
  retry_count int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pipeline_clusters_status_idx on public.pipeline_clusters (status, last_activity_at desc);
create index if not exists pipeline_clusters_story_idx on public.pipeline_clusters (story_id);
create index if not exists pipeline_clusters_last_activity_idx on public.pipeline_clusters (last_activity_at desc);

alter table public.pipeline_clusters enable row level security;

-- 3. Restrict both tables to the service role (the pipeline's DB client).
--    RLS is enabled with no public policies, so anon/authenticated roles are
--    denied by default; this grant is explicit and mirrors pipeline_locks.
revoke all on table public.article_rejections from public, anon, authenticated;
revoke all on table public.pipeline_clusters from public, anon, authenticated;
grant select, insert, update, delete on table public.article_rejections to service_role;
grant select, insert, update, delete on table public.pipeline_clusters to service_role;
