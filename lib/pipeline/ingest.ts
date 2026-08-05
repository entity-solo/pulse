import { createAdminClient } from "@/lib/supabase/admin"
import { classifyArticles, clusterClassifiedArticles, type ClassifiedArticle, type ClusteredEvent } from "./analyze"
import { INGEST } from "./config"
import { fetchArticles, passesPreFilters, type Article } from "./news"
import { fetchEquityQuotes, fetchMacroQuotes, type QuoteUpdate } from "./quotes"

export type RunResult = { job: string; status: "ok" | "partial" | "error"; quotesUpdated: number; articlesSeen: number; storiesUpserted: number; sourcesUpserted: number; tokensUsed: number; errors: string[]; warnings: string[] }
type Db = ReturnType<typeof createAdminClient>
type CacheRow = { url: string; content_hash: string; headline: string; summary: string; outlet: string; published_at: string; classification: unknown; expires_at: string }

function hash(value: string) { let result = 2_166_136_261; for (let i = 0; i < value.length; i++) { result ^= value.charCodeAt(i); result = Math.imul(result, 16_777_619) } return (result >>> 0).toString(16) }
function articleHash(article: Article) { return hash(`${article.url}\n${article.headline}\n${article.summary}`) }
function normalize(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((word) => word.length > 2) }
function titleSimilarity(left: string, right: string) { const a = new Set(normalize(left)), b = new Set(normalize(right)); let shared = 0; for (const word of a) if (b.has(word)) shared++; return shared / Math.max(1, Math.min(a.size, b.size)) }

function deriveDeterministicEventKey(ticker: string, sourceUrls: string[]): string {
  const sortedUrls = [...sourceUrls].sort().join("|")
  const keyHash = hash(`${ticker}:${sortedUrls}`)
  const cleanTicker = ticker.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  return `${cleanTicker}-${keyHash}`
}

async function writeQuotes(db: Db, quotes: QuoteUpdate[]) {
  const errors: string[] = []; let updated = 0
  const results = await Promise.allSettled(quotes.map(async (quote) => {
    const { error, count } = await db.from("tickers").update({ price: quote.price, change_pct: quote.change_pct, direction: quote.direction, updated_at: new Date().toISOString() }, { count: "exact" }).eq("symbol", quote.symbol)
    if (error) throw new Error(`${quote.symbol}: ${error.message}`)
    return count ?? 0
  }))
  for (const result of results) result.status === "fulfilled" ? updated += result.value : errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason))
  return { updated, errors }
}

/** Job 1: quotes:sync (every 5 minutes) — Finnhub equities parallel + Yahoo macro 300ms sequential */
export async function runQuotes(opts: { equities: boolean; macro: boolean }): Promise<RunResult> {
  const db = createAdminClient(); const startedAt = new Date().toISOString(); const quotes: QuoteUpdate[] = []; const errors: string[] = []
  if (opts.equities) { try { const result = await fetchEquityQuotes(); quotes.push(...result.quotes); errors.push(...result.errors) } catch (error) { errors.push(`equities: ${String(error)}`) } }
  if (opts.macro) { try { const result = await fetchMacroQuotes(); quotes.push(...result.quotes); errors.push(...result.errors) } catch (error) { errors.push(`macro: ${String(error)}`) } }
  const writes = await writeQuotes(db, quotes); errors.push(...writes.errors)
  const result: RunResult = { job: "quotes:sync", status: errors.length ? writes.updated ? "partial" : "error" : "ok", quotesUpdated: writes.updated, articlesSeen: 0, storiesUpserted: 0, sourcesUpserted: 0, tokensUsed: 0, errors, warnings: [] }
  await logRun(db, result, startedAt)
  return result
}

async function cacheArticles(db: Db, articles: Article[], warnings: string[]) {
  const now = new Date(); const nowIso = now.toISOString(); const expiresAt = new Date(now.getTime() + INGEST.articleCacheDays * 86_400_000).toISOString(); const hashes = new Map(articles.map((article) => [article.url, articleHash(article)]))
  const { data, error } = await db.from("article_cache").select("url, content_hash, expires_at").in("url", articles.map((article) => article.url))
  if (error) warnings.push(`article cache lookup failed: ${error.message}`)
  const cached = new Map((data ?? []).map((row: any) => [row.url, row]))
  const fresh = articles.filter((article) => { const row = cached.get(article.url); return !row || row.content_hash !== hashes.get(article.url) || new Date(row.expires_at).getTime() <= now.getTime() })
  if (fresh.length) {
    const records = fresh.map((article) => {
      const passes = passesPreFilters(article.headline, article.summary, article.url)
      return {
        url: article.url,
        content_hash: hashes.get(article.url),
        headline: article.headline,
        summary: article.summary,
        outlet: article.outlet,
        published_at: article.publishedAt,
        fetched_at: nowIso,
        expires_at: expiresAt,
        classification: passes ? null : { kind: "none" },
        classified_at: passes ? null : nowIso,
        classification_attempted_at: passes ? null : nowIso,
        updated_at: nowIso,
      }
    })
    const { error: writeError } = await db.from("article_cache").upsert(records, { onConflict: "url" })
    if (writeError) warnings.push(`article cache write failed: ${writeError.message}`)
  }
  return fresh
}

/** Job 2: news:ingest (every 15 minutes) — RSS fetch + cleaning + domain/keyword pre-filter storage */
export async function runIngestNews(): Promise<RunResult> {
  const db = createAdminClient(); const startedAt = new Date().toISOString(); const errors: string[] = []; const warnings: string[] = []
  let articlesSeen = 0
  try {
    const news = await fetchArticles(new Set())
    errors.push(...news.errors)
    articlesSeen = news.articles.length
    const fresh = await cacheArticles(db, news.articles, warnings)
    console.log(`[news:ingest] Fetched ${news.articles.length} RSS articles. ${fresh.length} fresh articles cached.`)
  } catch (error) {
    errors.push(`news:ingest failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  const result: RunResult = { job: "news:ingest", status: errors.length ? "partial" : "ok", quotesUpdated: 0, articlesSeen, storiesUpserted: 0, sourcesUpserted: 0, tokensUsed: 0, errors, warnings }
  await logRun(db, result, startedAt)
  return result
}

function cacheToClassified(rows: CacheRow[]): ClassifiedArticle[] {
  return rows.flatMap((row) => {
    const data = row.classification
    if (!data || typeof data !== "object") return []
    const value = data as Record<string, unknown>
    const kind = String(value.kind ?? "")
    const target = String(value.value ?? "")
    const confidence = Number(value.confidence)
    const evidence = String(value.evidence ?? "")
    if (kind === "none" || !Number.isFinite(confidence) || !evidence || !["ticker", "sector"].includes(kind)) return []
    return [{ article: { url: row.url, headline: row.headline, summary: row.summary, outlet: row.outlet, publishedAt: row.published_at, relatedSymbol: null }, classification: { kind: kind as "ticker", value: target, confidence, evidence } as any }]
  })
}

async function updateClassifications(db: Db, classified: ClassifiedArticle[], warnings: string[]) {
  const now = new Date().toISOString()
  const writes = await Promise.all(classified.map(({ article, classification }) => db.from("article_cache").update({ classification, classified_at: now, updated_at: now }).eq("url", article.url)))
  for (const write of writes) if (write.error) warnings.push(`classification cache write failed: ${write.error.message}`)
}

async function resolveRecentEventKey(db: Db, event: ClusteredEvent) {
  const since = new Date(Date.now() - INGEST.articleCacheDays * 86_400_000).toISOString()
  const { data } = await db.from("stories").select("event_key, title").eq("ticker", event.ticker).gte("published_at", since).limit(100)
  const match = (data ?? []).find((row: any) => row.event_key === event.event_key || titleSimilarity(event.title, String(row.title ?? "")) >= 0.75)
  return match?.event_key ?? event.event_key
}

/** Job 3: pipeline:analyze (every 15 minutes, offset 1 min) — Groq classification, lexical clustering, impact analysis & story upserts */
export async function runAnalyzePipeline(): Promise<RunResult> {
  const db = createAdminClient(); const startedAt = new Date().toISOString(); const errors: string[] = []; const warnings: string[] = []; let tokensUsed = 0; let events: ClusteredEvent[] = []
  try {
    const since = new Date(Date.now() - INGEST.clusterWindowHours * 3_600_000).toISOString()
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 3_600_000).toISOString()
    const tQueryStart = Date.now()
    const { data: unclassifiedRows } = await db.from("article_cache").select("url, headline, summary, outlet, published_at").is("classified_at", null).or(`classification_attempted_at.is.null,classification_attempted_at.lt.${twentyFourHoursAgo}`).gte("published_at", since).gte("expires_at", new Date().toISOString()).order("published_at", { ascending: false }).limit(60)
    const queryMs = Date.now() - tQueryStart
    console.log(`[timing] Query unclassified articles from cache: ${queryMs}ms (${unclassifiedRows?.length ?? 0} rows retrieved)`)

    const toClassify: Article[] = ((unclassifiedRows ?? []) as any[]).flatMap((row) => passesPreFilters(row.headline, row.summary || "", row.url) ? [{ url: row.url, headline: row.headline, summary: row.summary, outlet: row.outlet, publishedAt: row.published_at, relatedSymbol: null }] : [])

    if (toClassify.length) {
      console.log(`[pipeline:analyze] Classifying ${toClassify.length} unclassified articles...`)
      for (let start = 0; start < toClassify.length; start += INGEST.classificationBatchSize) {
        const batch = toClassify.slice(start, start + INGEST.classificationBatchSize)
        const attemptNow = new Date().toISOString()
        await db.from("article_cache").update({ classification_attempted_at: attemptNow, updated_at: attemptNow }).in("url", batch.map((a) => a.url))
        const classifiedBatch = await classifyArticles(batch)
        warnings.push(...classifiedBatch.warnings)
        tokensUsed += classifiedBatch.tokensUsed
        await updateClassifications(db, classifiedBatch.classified, warnings)
      }
    }

    const { data, error } = await db.from("article_cache").select("url, content_hash, headline, summary, outlet, published_at, classification, expires_at").not("classification", "is", null).not("classified_at", "is", null).gte("published_at", since).gte("expires_at", new Date().toISOString()).order("published_at", { ascending: false }).limit(500)
    if (error) warnings.push(`classified cache lookup failed: ${error.message}`)

    const classifiedRows = cacheToClassified((data ?? []) as CacheRow[])
    const clustered = await clusterClassifiedArticles(classifiedRows)
    events = clustered.events
    tokensUsed += clustered.tokensUsed
    warnings.push(...clustered.warnings)
  } catch (error) {
    errors.push(`pipeline:analyze failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  let storiesUpserted = 0; let sourcesUpserted = 0
  for (const event of events) try {
    const tUpsertStart = Date.now()
    event.event_key = deriveDeterministicEventKey(event.ticker, event.sources.map((s) => s.article.url))
    const eventKey = await resolveRecentEventKey(db, event)
    const { data: story, error: storyError } = await db.from("stories").upsert({ event_key: eventKey, ticker: event.ticker, is_macro: event.is_macro, sentiment: event.sentiment, title: event.title, summary: event.summary, published_at: event.publishedAt }, { onConflict: "event_key" }).select("id").single()
    if (storyError) throw new Error(storyError.message)
    storiesUpserted++
    const { error: sourceError, count } = await db.from("story_sources").upsert(event.sources.map((source, index) => ({ story_id: story.id, outlet: source.article.outlet, headline: source.article.headline, excerpt: source.article.summary || source.article.headline, angle: source.angle, url: source.article.url, display_order: index + 1 })), { onConflict: "story_id,url", count: "exact" })
    if (sourceError) throw sourceError
    sourcesUpserted += count ?? event.sources.length
    const upsertMs = Date.now() - tUpsertStart
    console.log(`[timing] DB upsert story (${event.ticker} - ${eventKey}): ${upsertMs}ms`)
  } catch (error) {
    errors.push(`event upsert: ${error instanceof Error ? error.message : String(error)}`)
  }

  const result: RunResult = { job: "pipeline:analyze", status: errors.length ? storiesUpserted ? "partial" : "error" : "ok", quotesUpdated: 0, articlesSeen: 0, storiesUpserted, sourcesUpserted, tokensUsed, errors, warnings }
  await logRun(db, result, startedAt)
  return result
}

/** Backward-compatible full pipeline runner */
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

export async function logRun(db: Db, result: RunResult, startedAt: string) {
  const { error } = await db.from("ingest_runs").insert({ job: result.job, status: result.status, started_at: startedAt, finished_at: new Date().toISOString(), quotes_updated: result.quotesUpdated, articles_seen: result.articlesSeen, stories_upserted: result.storiesUpserted, sources_upserted: result.sourcesUpserted, detail: { errors: result.errors.slice(0, 25), warnings: result.warnings.slice(0, 25), tokens_used: result.tokensUsed } })
  if (error) console.log("[v0] ingest_runs insert failed:", error.message)
}