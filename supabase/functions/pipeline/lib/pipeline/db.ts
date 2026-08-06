import { createAdminClient } from "../supabase/admin.ts"
import { CLUSTER, EMBED, FILTER, GC, INGEST } from "./config.ts"
import type { Article } from "./news.ts"
import { toVector } from "./text.ts"

export type Db = ReturnType<typeof createAdminClient>

export type PipelineArticle = Article & { embedding: number[] | null }

export type RejectionInput = {
  url: string
  headline: string
  outlet: string
  publishedAt: string
  reason: string
  score: number | null
  anchor: string | null
}

/** Articles awaiting embedding: pending, or a stale claiming row. */
export async function claimForEmbedding(db: Db, limit: number): Promise<PipelineArticle[]> {
  const now = new Date()
  const staleBefore = new Date(now.getTime() - EMBED.staleClaimMinutes * 60_000).toISOString()
  const { data, error } = await db
    .from("article_cache")
    .select("url, headline, summary, outlet, published_at")
    .is("embedding", null)
    .gt("expires_at", now.toISOString())
    .or(`status.eq.pending,status.eq.claiming,status.eq.done,status.eq.failed`)
    .or(`claimed_at.is.null,claimed_at.lt.${staleBefore}`)
    .order("published_at", { ascending: false })
    .limit(limit)
  if (error) throw new Error(`claimForEmbedding: ${error.message}`)

  const rows = (data ?? []) as Array<{ url: string; headline: string; summary: string; outlet: string; published_at: string }>
  const urls = rows.map((row) => row.url)
  if (urls.length) {
    const { error: claimError } = await db
      .from("article_cache")
      .update({ status: "claiming", claimed_at: now.toISOString(), updated_at: now.toISOString() })
      .in("url", urls)
    if (claimError) throw new Error(`claimForEmbedding mark: ${claimError.message}`)
  }
  return rows.map((row) => ({
    url: row.url,
    headline: row.headline,
    summary: row.summary,
    outlet: row.outlet,
    publishedAt: row.published_at,
    relatedSymbol: null,
    embedding: null,
  }))
}

/** Articles that are embedded and have not yet been filtered/clustered. */
export async function claimForFilter(db: Db, limit: number, memberUrls: Set<string>): Promise<PipelineArticle[]> {
  const now = new Date()
  const failedBefore = new Date(now.getTime() - FILTER.failedRetryMinutes * 60_000).toISOString()
  const { data, error } = await db
    .from("article_cache")
    .select("url, headline, summary, outlet, published_at, embedding")
    .not("embedding", "is", null)
    .is("cluster_id", null)
    .gt("expires_at", now.toISOString())
    .or(`status.eq.pending,status.eq.claiming,status.eq.done,status.eq.failed`)
    .lt("published_at", now.toISOString())
    .order("published_at", { ascending: false })
    .limit(limit)
  if (error) throw new Error(`claimForFilter: ${error.message}`)

  const rows = (data ?? []) as Array<{
    url: string
    headline: string
    summary: string
    outlet: string
    published_at: string
    embedding: unknown
    classification_attempted_at: string | null
    status: string
  }>

  const candidates = rows.filter((row) => {
    if (memberUrls.has(row.url)) return false
    if (row.status === "failed" && row.classification_attempted_at && row.classification_attempted_at >= failedBefore) return false
    return true
  })

  const urls = candidates.map((row) => row.url)
  if (urls.length) {
    const { error: claimError } = await db
      .from("article_cache")
      .update({ status: "claiming", claimed_at: now.toISOString(), updated_at: now.toISOString() })
      .in("url", urls)
    if (claimError) throw new Error(`claimForFilter mark: ${claimError.message}`)
  }
  return candidates.map((row) => ({
    url: row.url,
    headline: row.headline,
    summary: row.summary,
    outlet: row.outlet,
    publishedAt: row.published_at,
    relatedSymbol: null,
    embedding: toVector(row.embedding),
  }))
}

export async function markEmbedded(db: Db, url: string): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await db.from("article_cache").update({ status: "done", updated_at: now }).eq("url", url)
  if (error) throw new Error(`markEmbedded ${url}: ${error.message}`)
}

export async function setEmbedding(db: Db, url: string, embedding: number[]): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await db.from("article_cache").update({ embedding, updated_at: now }).eq("url", url)
  if (error) throw new Error(`setEmbedding ${url}: ${error.message}`)
}

export async function markEmbedFailed(db: Db, url: string): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await db
    .from("article_cache")
    .update({ status: "pending", claimed_at: null, updated_at: now })
    .eq("url", url)
  if (error) throw new Error(`markEmbedFailed ${url}: ${error.message}`)
}

export async function markFilterRetry(db: Db, url: string, reason: string): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await db
    .from("article_cache")
    .update({
      status: "failed",
      classification_attempted_at: now,
      last_error: reason,
      updated_at: now,
    })
    .eq("url", url)
  if (error) throw new Error(`markFilterRetry ${url}: ${error.message}`)
}

export async function markArticleDone(db: Db, url: string): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await db
    .from("article_cache")
    .update({ status: "done", classification_attempted_at: now, updated_at: now })
    .eq("url", url)
  if (error) throw new Error(`markArticleDone ${url}: ${error.message}`)
}

export async function logRejection(db: Db, input: RejectionInput): Promise<void> {
  const { error } = await db.from("article_rejections").upsert(
    {
      url: input.url,
      headline: input.headline,
      outlet: input.outlet,
      published_at: input.publishedAt,
      reason: input.reason,
      score: input.score,
      anchor: input.anchor,
      rejected_at: new Date().toISOString(),
    },
    { onConflict: "url" }
  )
  if (error) throw new Error(`logRejection ${input.url}: ${error.message}`)
}

export async function removeArticle(db: Db, url: string): Promise<void> {
  const { error } = await db.from("article_cache").delete().eq("url", url)
  if (error) throw new Error(`removeArticle ${url}: ${error.message}`)
}

export async function loadAllowedTickers(db: Db): Promise<Set<string>> {
  const { data, error } = await db.from("tickers").select("symbol")
  if (error) throw new Error(`loadAllowedTickers: ${error.message}`)
  return new Set((data ?? []).map((row) => String(row.symbol)))
}

export type ClusterRow = {
  id: string
  key: string
  status: string
  title: string | null
  member_urls: unknown
  centroid: unknown
  article_count: number
  first_seen_at: string
  last_activity_at: string
  last_analysis_at: string | null
  retry_count: number
  last_error: string | null
  story_id: string | null
}

export async function loadActiveClusters(db: Db): Promise<ClusterRow[]> {
  const { data, error } = await db
    .from("pipeline_clusters")
    .select("id, key, status, title, member_urls, centroid, article_count, first_seen_at, last_activity_at, last_analysis_at, retry_count, last_error, story_id")
    .in("status", ["open", "stable", "analyzing", "failed", "merged"])
  if (error) throw new Error(`loadActiveClusters: ${error.message}`)
  return (data ?? []) as ClusterRow[]
}

export async function loadOpenClusters(db: Db): Promise<ClusterRow[]> {
  const { data, error } = await db
    .from("pipeline_clusters")
    .select("id, key, status, title, member_urls, centroid, article_count, first_seen_at, last_activity_at, last_analysis_at, retry_count, last_error, story_id")
    .eq("status", "open")
  if (error) throw new Error(`loadOpenClusters: ${error.message}`)
  return (data ?? []) as ClusterRow[]
}

export async function loadStableUnanalyzedClusters(db: Db): Promise<ClusterRow[]> {
  const now = new Date()
  const retryBefore = new Date(now.getTime() - CLUSTER.analysisRetryMinutes * 60_000).toISOString()
  const { data, error } = await db
    .from("pipeline_clusters")
    .select("id, key, status, title, member_urls, centroid, article_count, first_seen_at, last_activity_at, last_analysis_at, retry_count, last_error, story_id")
    .in("status", ["stable", "failed"])
    .or(`last_analysis_at.is.null,last_analysis_at.lt.${retryBefore}`)
    .order("article_count", { ascending: false })
    .limit(20)
  if (error) throw new Error(`loadStableUnanalyzedClusters: ${error.message}`)
  return (data ?? []) as ClusterRow[]
}

export async function loadClusterMembers(db: Db, cluster: ClusterRow): Promise<PipelineArticle[]> {
  const urls = Array.isArray(cluster.member_urls) ? cluster.member_urls.map(String) : []
  if (!urls.length) return []
  const { data, error } = await db
    .from("article_cache")
    .select("url, headline, summary, outlet, published_at, embedding")
    .in("url", urls)
    .gt("expires_at", new Date().toISOString())
  if (error) throw new Error(`loadClusterMembers: ${error.message}`)
  return ((data ?? []) as Array<{ url: string; headline: string; summary: string; outlet: string; published_at: string; embedding: unknown }>).map((row) => ({
    url: row.url,
    headline: row.headline,
    summary: row.summary,
    outlet: row.outlet,
    publishedAt: row.published_at,
    relatedSymbol: null,
    embedding: toVector(row.embedding),
  }))
}

export async function createCluster(db: Db, key: string, article: PipelineArticle): Promise<string> {
  const now = new Date().toISOString()
  const { data, error } = await db
    .from("pipeline_clusters")
    .insert({
      key,
      status: "open",
      title: article.headline,
      member_urls: [article.url],
      centroid: article.embedding,
      article_count: 1,
      first_seen_at: now,
      last_activity_at: now,
    })
    .select("id")
    .single()
  if (error) throw new Error(`createCluster ${key}: ${error.message}`)
  return data.id
}

export async function appendToCluster(db: Db, cluster: ClusterRow, article: PipelineArticle): Promise<void> {
  const urls = Array.isArray(cluster.member_urls) ? cluster.member_urls.map(String) : []
  if (urls.includes(article.url)) return
  const current = toVector(cluster.centroid)
  const next = current.length && article.embedding?.length
    ? current.map((v, i) => (v * cluster.article_count + (article.embedding![i] ?? 0)) / (cluster.article_count + 1))
    : (article.embedding ?? current)
  const now = new Date().toISOString()
  const { error } = await db
    .from("pipeline_clusters")
    .update({
      member_urls: [...urls, article.url],
      centroid: next,
      article_count: cluster.article_count + 1,
      title: article.headline,
      last_activity_at: now,
      updated_at: now,
    })
    .eq("id", cluster.id)
  if (error) throw new Error(`appendToCluster ${cluster.id}: ${error.message}`)
}

export async function markClusterStable(db: Db, clusterId: string): Promise<void> {
  const { error } = await db
    .from("pipeline_clusters")
    .update({ status: "stable", updated_at: new Date().toISOString() })
    .eq("id", clusterId)
  if (error) throw new Error(`markClusterStable ${clusterId}: ${error.message}`)
}

export async function markClusterAnalyzing(db: Db, clusterId: string): Promise<void> {
  const { error } = await db
    .from("pipeline_clusters")
    .update({ status: "analyzing", updated_at: new Date().toISOString() })
    .eq("id", clusterId)
  if (error) throw new Error(`markClusterAnalyzing ${clusterId}: ${error.message}`)
}

export async function markClusterFailed(db: Db, clusterId: string, reason: string): Promise<void> {
  const { data, error } = await db
    .from("pipeline_clusters")
    .update({
      status: "failed",
      last_analysis_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_error: reason,
    })
    .eq("id", clusterId)
    .select("retry_count")
    .single()
  if (error) throw new Error(`markClusterFailed ${clusterId}: ${error.message}`)
  const retryCount = Number((data as { retry_count?: number } | null)?.retry_count ?? 0)
  const { error: retryError } = await db
    .from("pipeline_clusters")
    .update({ retry_count: retryCount + 1 })
    .eq("id", clusterId)
  if (retryError) throw new Error(`markClusterFailed retry ${clusterId}: ${retryError.message}`)
}

/** Reclaim 'analyzing' clusters left behind by a crashed run. */
export async function reclaimStaleAnalyzingClusters(db: Db, retryMinutes: number): Promise<void> {
  const cutoff = new Date(Date.now() - retryMinutes * 60_000).toISOString()
  const { error } = await db
    .from("pipeline_clusters")
    .update({ status: "failed", last_error: "stale analyzing claim", last_analysis_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("status", "analyzing")
    .lt("updated_at", cutoff)
  if (error) throw new Error(`reclaimStaleAnalyzingClusters: ${error.message}`)
}

export async function markClusterDone(db: Db, clusterId: string, storyId: string): Promise<void> {
  const { error } = await db
    .from("pipeline_clusters")
    .update({
      status: "done",
      story_id: storyId,
      last_analysis_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", clusterId)
  if (error) throw new Error(`markClusterDone ${clusterId}: ${error.message}`)
}

export async function setArticleClusterId(db: Db, urls: string[], storyId: string): Promise<void> {
  if (!urls.length) return
  const now = new Date().toISOString()
  const { error } = await db
    .from("article_cache")
    .update({ cluster_id: storyId, status: "done", updated_at: now })
    .in("url", urls)
  if (error) throw new Error(`setArticleClusterId: ${error.message}`)
}

export async function matchExistingStory(db: Db, embedding: number[], maxDistance: number, sinceHours = 48): Promise<string | null> {
  const since = new Date(Date.now() - sinceHours * 3_600_000).toISOString()
  const { data, error } = await db.rpc("match_existing_story", {
    query_embedding: embedding,
    match_threshold: maxDistance,
    since_timestamp: since,
  })
  if (error) throw new Error(`matchExistingStory: ${error.message}`)
  if (Array.isArray(data) && data.length > 0 && (data[0] as { story_id?: string }).story_id) {
    return (data[0] as { story_id: string }).story_id
  }
  return null
}

export async function upsertStorySource(db: Db, storyId: string, article: Article, angle: string, displayOrder: number): Promise<void> {
  const { error } = await db.from("story_sources").upsert(
    {
      story_id: storyId,
      outlet: article.outlet,
      headline: article.headline,
      excerpt: article.summary || article.headline,
      angle,
      url: article.url,
      display_order: displayOrder,
    },
    { onConflict: "story_id,url" }
  )
  if (error) throw new Error(`upsertStorySource ${article.url}: ${error.message}`)
}

/** Nightly GC: expired articles, stale clusters, old rejections/runs/locks. */
export async function runGc(db: Db, warnings: string[]): Promise<void> {
  const nowIso = new Date().toISOString()
  const { error: cacheErr } = await db.from("article_cache").delete().lt("expires_at", nowIso)
  if (cacheErr) warnings.push(`gc article_cache: ${cacheErr.message}`)

  const clusterCutoff = new Date(Date.now() - GC.clusterRetentionDays * 86_400_000).toISOString()
  const { error: clusterErr } = await db
    .from("pipeline_clusters")
    .delete()
    .in("status", ["done", "merged", "failed", "analyzing"])
    .lt("updated_at", clusterCutoff)
  if (clusterErr) warnings.push(`gc pipeline_clusters: ${clusterErr.message}`)

  const rejectionCutoff = new Date(Date.now() - GC.rejectionRetentionDays * 86_400_000).toISOString()
  const { error: rejectionErr } = await db.from("article_rejections").delete().lt("rejected_at", rejectionCutoff)
  if (rejectionErr) warnings.push(`gc article_rejections: ${rejectionErr.message}`)

  const runsCutoff = new Date(Date.now() - GC.runRetentionDays * 86_400_000).toISOString()
  const { error: runsErr } = await db.from("ingest_runs").delete().lt("started_at", runsCutoff)
  if (runsErr) warnings.push(`gc ingest_runs: ${runsErr.message}`)

  const { error: locksErr } = await db.from("pipeline_locks").delete().lt("expires_at", nowIso)
  if (locksErr) warnings.push(`gc pipeline_locks: ${locksErr.message}`)
}
