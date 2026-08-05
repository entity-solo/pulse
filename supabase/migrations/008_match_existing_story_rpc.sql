-- RPC function for pgvector similarity matching against existing 24h stories
create or replace function match_existing_story(
  query_embedding vector(384),
  match_threshold float,
  since_timestamp timestamptz
)
returns table (
  story_id uuid,
  distance float
)
language plpgsql
as $$
begin
  return query
  select
    s.id as story_id,
    (a.embedding <=> query_embedding)::float as distance
  from stories s
  join article_cache a on a.cluster_id = s.id
  where s.published_at >= since_timestamp
    and a.embedding is not null
    and (a.embedding <=> query_embedding) < match_threshold
  order by (a.embedding <=> query_embedding) asc
  limit 1;
end;
$$;
