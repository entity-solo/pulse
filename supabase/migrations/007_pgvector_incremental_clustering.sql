-- Enable pgvector
create extension if not exists vector;

-- Add embedding column to article_cache (384-dimensional vector for gte-small model)
alter table article_cache add column if not exists embedding vector(384);

-- Add index for fast similarity search
create index if not exists article_cache_embedding_idx 
on article_cache using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

-- Add cluster_id to article_cache
alter table article_cache add column if not exists cluster_id uuid references stories(id);
