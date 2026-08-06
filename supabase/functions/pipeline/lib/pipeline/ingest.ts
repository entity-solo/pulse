import { createAdminClient } from "../supabase/admin.ts"
import { runAnalyzeSteps } from "./analyze.ts"
import { INGEST, LOCK } from "./config.ts"
import type { Db } from "./db.ts"
import { fetchArticles, passesPreFilters, type Article } from "./news.ts"
import { fetchEquityQuotes, fetchMacroQuotes, type QuoteUpdate } from "./quotes.ts"
import { hash } from "./text.ts"

export type RunResult = {
  job: string
  status: "ok" | "partial" | "error" | "skipped"
  quotesUpdated: number
  articlesSeen: number
  storiesUpserted: number
  sourcesUpserted: number
  tokensUsed: number
  errors: string[]
  warnings: string[]
}

type DbClient = Db

function articleHash(article: Article): string {
  return hash(`${article.url}\n${article.headline}\n${article.summary}`)
}

async function writeQuotes(db: DbClient, quotes: QuoteUpdate[]): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = []
  let updated = 0
  const results = await Promise.allSettled(
    quotes.map(async (quote) => {
      const { error, count } = await db
        .from("tickers")
        .update({
          price: quote.price,
          change_pct: quote.change_pct,
          direction: quote.direction,
          updated_at: new Date().toISOString(),
        }, { count: "exact" })
        .eq("symbol", quote.symbol)
      if (error) throw new Error(`${quote.symbol}: ${error.message}`)
      return count ?? 0
    })
  )
  for (const result of results) {
    if (result.status === "fulfilled") updated += result.value
    else errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason))
  }
  return { updated, errors }
}

async function tryAcquireLock(db: DbClient, job: string, lockSeconds: number): Promise<boolean> {
  const { data, error } = await db.rpc("acquire_pipeline_lock", { p_job: job, p_lock_seconds: lockSeconds })
  if (error) throw error
  return data === true
}

async function releaseLock(db: DbClient, job: string): Promise<void> {
  try {
    await db.rpc("release_pipeline_lock", { p_job: job })
  } catch {}
}

/** Job 1: quotes:sync — Finnhub equities parallel + Yahoo macro sequential. */
export async function runQuotes(opts: { equities: boolean; macro: boolean }): Promise<RunResult> {
  const db = createAdminClient()
  const startedAt = new Date().toISOString()
  const result: RunResult = {
    job: "quotes:sync",
    status: "ok",
    quotesUpdated: 0,
    articlesSeen: 0,
    storiesUpserted: 0,
    sourcesUpserted: 0,
    tokensUsed: 0,
    errors: [],
    warnings: [],
  }

  try {
    if (!(await tryAcquireLock(db, "quotes:sync", LOCK.quotesSeconds))) {
      result.status = "skipped"
      result.warnings.push("another quotes run in progress; skipping")
    } else {
      try {
        if (opts.equities) {
          const equity = await fetchEquityQuotes()
          result.errors.push(...equity.errors)
          const writes = await writeQuotes(db, equity.quotes)
          result.quotesUpdated += writes.updated
          result.errors.push(...writes.errors)
        }
        if (opts.macro) {
          const macro = await fetchMacroQuotes()
          result.errors.push(...macro.errors)
          const writes = await writeQuotes(db, macro.quotes)
          result.quotesUpdated += writes.updated
          result.errors.push(...writes.errors)
        }
      } finally {
        await releaseLock(db, "quotes:sync")
      }
    }
  } catch (error) {
    result.errors.push(`quotes:sync failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  result.status = result.status === "skipped" ? "skipped" : result.errors.length ? (result.quotesUpdated ? "partial" : "error") : "ok"
  await logRun(db, result, startedAt)
  return result
}

/**
 * Job 2: news:ingest — RSS fetch + domain/keyword pre-filter. Articles are
 * stored as status 'pending' with no embedding/classification; the analyze
 * job owns embedding, filtering, clustering and analysis.
 */
export async function runIngestNews(): Promise<RunResult> {
  const db = createAdminClient()
  const startedAt = new Date().toISOString()
  const result: RunResult = {
    job: "news:ingest",
    status: "ok",
    quotesUpdated: 0,
    articlesSeen: 0,
    storiesUpserted: 0,
    sourcesUpserted: 0,
    tokensUsed: 0,
    errors: [],
    warnings: [],
  }

  try {
    if (!(await tryAcquireLock(db, "news:ingest", LOCK.ingestSeconds))) {
      result.status = "skipped"
      result.warnings.push("another ingest run in progress; skipping")
      await logRun(db, result, startedAt)
      return result
    }
    try {
      const news = await fetchArticles(new Set(), INGEST.maxArticlesPerRun)
      result.errors.push(...news.errors)
      result.articlesSeen = news.articles.length

      const now = new Date()
      const nowIso = now.toISOString()
      const expiresAt = new Date(now.getTime() + INGEST.articleCacheDays * 86_400_000).toISOString()

      const candidates = news.articles.filter((article) => passesPreFilters(article.headline, article.summary, article.url))
      const hashes = new Map(candidates.map((article) => [article.url, articleHash(article)]))
      const { data: cached, error: lookupError } = await db
        .from("article_cache")
        .select("url, content_hash, expires_at")
        .in("url", candidates.map((article) => article.url))
      if (lookupError) result.warnings.push(`article cache lookup failed: ${lookupError.message}`)
      const cachedMap = new Map((cached ?? []).map((row: any) => [row.url, row]))

      const fresh = candidates
        .filter((article) => {
          const row = cachedMap.get(article.url)
          return !row || row.content_hash !== hashes.get(article.url) || new Date(row.expires_at).getTime() <= now.getTime()
        })
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))

      if (fresh.length) {
        const records = fresh.map((article) => ({
          url: article.url,
          content_hash: hashes.get(article.url),
          headline: article.headline,
          summary: article.summary,
          outlet: article.outlet,
          published_at: article.publishedAt,
          fetched_at: nowIso,
          expires_at: expiresAt,
          status: "pending",
          classification: null,
          classified_at: null,
          classification_attempted_at: null,
          cluster_id: null,
          embedding: null,
          claimed_at: null,
          last_error: null,
          updated_at: nowIso,
        }))
        const { error: writeError } = await db.from("article_cache").upsert(records, { onConflict: "url" })
        if (writeError) result.warnings.push(`article cache write failed: ${writeError.message}`)
      }
      console.log(`[news:ingest] Fetched ${news.articles.length} RSS articles, ${fresh.length} fresh cached.`)
    } finally {
      await releaseLock(db, "news:ingest")
    }
  } catch (error) {
    result.errors.push(`news:ingest failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  result.status = result.status === "skipped" ? "skipped" : result.errors.length ? "partial" : "ok"
  await logRun(db, result, startedAt)
  return result
}

/**
 * Job 3: pipeline:analyze — embed -> filter -> cluster -> analyze under a
 * single-flight lock. Irrelevant articles are logged to article_rejections
 * and removed from the cache; stable clusters produce stories exactly once.
 */
export async function runAnalyzePipeline(): Promise<RunResult> {
  const db = createAdminClient()
  const startedAt = new Date().toISOString()
  const result: RunResult = {
    job: "pipeline:analyze",
    status: "ok",
    quotesUpdated: 0,
    articlesSeen: 0,
    storiesUpserted: 0,
    sourcesUpserted: 0,
    tokensUsed: 0,
    errors: [],
    warnings: [],
  }

  try {
    if (!(await tryAcquireLock(db, "pipeline:analyze", LOCK.analyzeSeconds))) {
      result.status = "skipped"
      result.warnings.push("another analyze run in progress; skipping")
      await logRun(db, result, startedAt)
      return result
    }
    try {
      const stats = await runAnalyzeSteps(db)
      result.storiesUpserted = stats.storiesUpserted
      result.sourcesUpserted = stats.sourcesUpserted
      result.tokensUsed = stats.tokensUsed
      result.errors.push(...stats.errors)
      result.warnings.push(...stats.warnings)
      console.log(
        `[pipeline:analyze] embedded=${stats.embedded} kept=${stats.kept} rejected=${stats.rejected} ` +
          `retry=${stats.filterRetry} assigned=${stats.clusterAssigned} matched=${stats.matchedExisting} ` +
          `newClusters=${stats.newClusters} stories=${stats.storiesUpserted}`
      )
    } finally {
      await releaseLock(db, "pipeline:analyze")
    }
  } catch (error) {
    result.errors.push(`pipeline:analyze failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  result.status = result.status === "skipped" ? "skipped" : result.errors.length ? (result.storiesUpserted ? "partial" : "error") : "ok"
  await logRun(db, result, startedAt)
  return result
}

/** Backward-compatible full pipeline runner. */
export async function runIngest(): Promise<RunResult> {
  const q = await runQuotes({ equities: true, macro: true })
  const n = await runIngestNews()
  const a = await runAnalyzePipeline()
  return {
    job: "ingest",
    status: q.status === "error" || n.status === "error" || a.status === "error" ? "error" : q.status === "partial" || n.status === "partial" || a.status === "partial" ? "partial" : "ok",
    quotesUpdated: q.quotesUpdated,
    articlesSeen: n.articlesSeen,
    storiesUpserted: a.storiesUpserted,
    sourcesUpserted: a.sourcesUpserted,
    tokensUsed: a.tokensUsed,
    errors: [...q.errors, ...n.errors, ...a.errors],
    warnings: [...q.warnings, ...n.warnings, ...a.warnings],
  }
}

export async function logRun(db: DbClient, result: RunResult, startedAt: string) {
  const { error } = await db.from("ingest_runs").insert({
    job: result.job,
    status: result.status,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    quotes_updated: result.quotesUpdated,
    articles_seen: result.articlesSeen,
    stories_upserted: result.storiesUpserted,
    sources_upserted: result.sourcesUpserted,
    detail: { errors: result.errors.slice(0, 25), warnings: result.warnings.slice(0, 25), tokens_used: result.tokensUsed },
  })
  if (error) console.log("[v0] ingest_runs insert failed:", error.message)
}
