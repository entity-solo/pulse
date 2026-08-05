-- Add classification_attempted_at column to article_cache table
ALTER TABLE article_cache
ADD COLUMN IF NOT EXISTS classification_attempted_at timestamptz;

-- Add index to speed up unclassified article lookup queries
CREATE INDEX IF NOT EXISTS idx_article_cache_attempted_at
ON article_cache (classification_attempted_at)
WHERE classification IS NULL;
