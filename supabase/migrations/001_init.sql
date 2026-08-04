-- Pulse — financial news aggregator
-- Tables + RLS policies. Idempotent — safe to re-run against any project.

create table if not exists public.tickers (
  symbol text primary key,
  name text not null,
  exchange text not null,
  price numeric(14,4) not null,
  change_pct numeric(8,3) not null,
  direction text not null check (direction in ('up','dn')),
  sector text not null check (sector in ('tech','finance','energy','macro','index','crypto','commodity')),
  updated_at timestamptz not null default now()
);

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  ticker text not null references public.tickers(symbol) on delete cascade,
  is_macro boolean not null default false,
  sentiment text not null check (sentiment in ('bull','bear','neut')),
  title text not null,
  summary text not null,
  published_at timestamptz not null default now()
);

create index if not exists stories_ticker_idx on public.stories (ticker);
create index if not exists stories_published_at_idx on public.stories (published_at desc);

create table if not exists public.story_sources (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  outlet text not null,
  headline text not null,
  excerpt text not null,
  angle text not null check (angle in ('bull','bear','neut')),
  url text not null,
  display_order int not null default 0
);

create index if not exists story_sources_story_id_idx on public.story_sources (story_id, display_order);

create table if not exists public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null references public.tickers(symbol) on delete cascade,
  added_at timestamptz not null default now(),
  unique (user_id, ticker)
);

create index if not exists watchlist_user_idx on public.watchlist (user_id);

alter table public.tickers enable row level security;
alter table public.stories enable row level security;
alter table public.story_sources enable row level security;
alter table public.watchlist enable row level security;

-- Market content is public read.
drop policy if exists "tickers_public_read" on public.tickers;
create policy "tickers_public_read" on public.tickers for select using (true);

drop policy if exists "stories_public_read" on public.stories;
create policy "stories_public_read" on public.stories for select using (true);

drop policy if exists "story_sources_public_read" on public.story_sources;
create policy "story_sources_public_read" on public.story_sources for select using (true);

-- Watchlist rows are owned by the user, and the referenced ticker must exist.
drop policy if exists "watchlist_select_own" on public.watchlist;
create policy "watchlist_select_own" on public.watchlist for select using (auth.uid() = user_id);

drop policy if exists "watchlist_insert_own" on public.watchlist;
create policy "watchlist_insert_own" on public.watchlist for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.tickers t where t.symbol = watchlist.ticker)
);

drop policy if exists "watchlist_delete_own" on public.watchlist;
create policy "watchlist_delete_own" on public.watchlist for delete using (auth.uid() = user_id);
