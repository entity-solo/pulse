create table if not exists public.article_cache (
  url text primary key,
  content_hash text not null,
  headline text not null,
  summary text not null default '',
  outlet text not null,
  published_at timestamptz not null,
  classification jsonb,
  classified_at timestamptz,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists article_cache_expires_at_idx on public.article_cache (expires_at);
create index if not exists article_cache_published_at_idx on public.article_cache (published_at desc);

alter table public.article_cache enable row level security;