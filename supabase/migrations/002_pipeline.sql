-- Pipeline metadata. Existing RLS policies are deliberately unchanged.
alter table public.stories add column if not exists event_key text;
update public.stories set event_key = 'legacy-' || id::text where event_key is null or btrim(event_key) = '';
alter table public.stories alter column event_key set not null;
do $$ begin if not exists (select 1 from pg_constraint where conrelid = 'public.stories'::regclass and conname = 'stories_event_key_key') then alter table public.stories add constraint stories_event_key_key unique (event_key); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conrelid = 'public.story_sources'::regclass and conname = 'story_sources_story_id_url_key') then alter table public.story_sources add constraint story_sources_story_id_url_key unique (story_id, url); end if; end $$;
create table if not exists public.ingest_runs (id uuid primary key default gen_random_uuid(), job text not null, status text not null check (status in ('ok', 'partial', 'error')), started_at timestamptz not null, finished_at timestamptz not null, quotes_updated integer not null default 0, articles_seen integer not null default 0, stories_upserted integer not null default 0, sources_upserted integer not null default 0, detail jsonb not null default '{}'::jsonb);
create index if not exists ingest_runs_started_at_idx on public.ingest_runs (started_at desc);
alter table public.ingest_runs enable row level security;