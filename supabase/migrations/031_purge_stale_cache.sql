-- 031: Purge stale article_cache rows left over from the pre-v4 pipeline.
-- 1. Rows the old ingest cached with classification {kind:"none"} (never real
--    articles; the current embed->filter pipeline was re-processing them one
--    by one and burning embeddings + Groq tokens).
-- 2. Expired rows that were already processed but never linked to a story.

delete from public.article_cache
where classification is not null
  and classification ->> 'kind' = 'none';

delete from public.article_cache
where status = 'done'
  and cluster_id is null
  and expires_at < now();
