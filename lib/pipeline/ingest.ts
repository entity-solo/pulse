import { createAdminClient } from "@/lib/supabase/admin"
import { clusterArticles } from "./analyze"
import { fetchArticles } from "./news"
import { fetchEquityQuotes, fetchMacroQuotes, type QuoteUpdate } from "./quotes"

export type RunResult = {
  job: string
  status: "ok" | "partial" | "error"
  quotesUpdated: number
  articlesSeen: number
  storiesUpserted: number
  sourcesUpserted: number
  errors: string[]
  warnings: string[]
}

type Db = ReturnType<typeof createAdminClient>

/** Writes quotes to `tickers`. Only touches rows that already exist. */
async function writeQuotes(db: Db, quotes: QuoteUpdate[]): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = []
  let updated = 0

  // Updated one row at a time: an upsert would need every NOT NULL column
  // (name, exchange, sector) and could overwrite curated ticker metadata.
  const results = await Promise.allSettled(
    quotes.map(async (q) => {
      const { error, count } = await db
        .from("tickers")
        .update(
          {
            price: q.price,
            change_pct: q.change_pct,
            direction: q.direction,
            updated_at: new Date().toISOString(),
          },
          { count: "exact" },
        )
        .eq("symbol", q.symbol)

      if (error) throw new Error(`${q.symbol}: ${error.message}`)
      return count ?? 0
    }),
  )

  for (const r of results) {
    if (r.status === "fulfilled") updated += r.value
    else errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason))
  }

  return { updated, errors }
}

/** Refreshes every quote we can price. Used by both the 15-min and hourly jobs. */
export async function runQuotes(opts: { equities: boolean; macro: boolean }): Promise<RunResult> {
  const db = createAdminClient()
  const errors: string[] = []
  const quotes: QuoteUpdate[] = []

  if (opts.equities) {
    try {
      const r = await fetchEquityQuotes()
      quotes.push(...r.quotes)
      errors.push(...r.errors)
    } catch (err) {
      errors.push(`equities: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (opts.macro) {
    try {
      const r = await fetchMacroQuotes()
      quotes.push(...r.quotes)
      errors.push(...r.errors)
    } catch (err) {
      errors.push(`macro: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const { updated, errors: writeErrors } = await writeQuotes(db, quotes)
  errors.push(...writeErrors)

  return {
    job: opts.equities && opts.macro ? "quotes:all" : opts.macro ? "quotes:macro" : "quotes:equities",
    status: errors.length === 0 ? "ok" : updated > 0 ? "partial" : "error",
    quotesUpdated: updated,
    articlesSeen: 0,
    storiesUpserted: 0,
    sourcesUpserted: 0,
    errors,
    warnings: [],
  }
}

/**
 * Full 15-minute cycle: refresh equity quotes, pull news, cluster it with the
 * model, and upsert the resulting events.
 *
 * Idempotent by design — `stories.event_key` and `story_sources(story_id,url)`
 * are unique, so re-running the same window updates rows instead of duplicating.
 */
export async function runIngest(): Promise<RunResult> {
  const db = createAdminClient()
  const startedAt = new Date().toISOString()
  const errors: string[] = []
  const warnings: string[] = []

  // 1. Quotes (equities only; macro runs hourly on its own schedule).
  let quotesUpdated = 0
  try {
    const q = await fetchEquityQuotes()
    errors.push(...q.errors)
    const w = await writeQuotes(db, q.quotes)
    quotesUpdated = w.updated
    errors.push(...w.errors)
  } catch (err) {
    errors.push(`quotes: ${err instanceof Error ? err.message : String(err)}`)
  }

  // 2. Skip articles already stored so the model only sees genuinely new copy.
  const knownUrls = new Set<string>()
  {
    const since = new Date(Date.now() - 36 * 3_600_000).toISOString()
    const { data, error } = await db
      .from("story_sources")
      .select("url, stories!inner(published_at)")
      .gte("stories.published_at", since)
      .limit(2000)

    if (error) warnings.push(`known-url lookup failed, may re-process articles: ${error.message}`)
    else for (const row of data ?? []) if (row.url) knownUrls.add(row.url as string)
  }

  // 3. Fetch news.
  let articlesSeen = 0
  let events: Awaited<ReturnType<typeof clusterArticles>>["events"] = []
  try {
    const news = await fetchArticles(knownUrls)
    errors.push(...news.errors)
    articlesSeen = news.articles.length

    if (news.articles.length > 0) {
      const clustered = await clusterArticles(news.articles)
      events = clustered.events
      warnings.push(...clustered.warnings)
    }
  } catch (err) {
    errors.push(`news/cluster: ${err instanceof Error ? err.message : String(err)}`)
  }

  // 4. Upsert stories + sources.
  let storiesUpserted = 0
  let sourcesUpserted = 0

  for (const event of events) {
    try {
      const { data: story, error: storyError } = await db
        .from("stories")
        .upsert(
          {
            event_key: event.event_key,
            ticker: event.ticker,
            is_macro: event.is_macro,
            sentiment: event.sentiment,
            title: event.title,
            summary: event.summary,
            published_at: event.publishedAt,
          },
          { onConflict: "event_key" },
        )
        .select("id")
        .single()

      if (storyError) throw new Error(storyError.message)
      storiesUpserted += 1

      const rows = event.sources.map((s, i) => ({
        story_id: story.id,
        outlet: s.article.outlet,
        headline: s.article.headline,
        excerpt: s.article.summary || s.article.headline,
        angle: s.angle,
        url: s.article.url,
        display_order: i + 1,
      }))

      const { error: srcError, count } = await db
        .from("story_sources")
        .upsert(rows, { onConflict: "story_id,url", count: "exact" })

      if (srcError) throw new Error(`sources: ${srcError.message}`)
      sourcesUpserted += count ?? rows.length
    } catch (err) {
      errors.push(`event '${event.event_key}': ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const status: RunResult["status"] =
    errors.length === 0 ? "ok" : storiesUpserted > 0 || quotesUpdated > 0 ? "partial" : "error"

  const result: RunResult = {
    job: "ingest",
    status,
    quotesUpdated,
    articlesSeen,
    storiesUpserted,
    sourcesUpserted,
    errors,
    warnings,
  }

  await logRun(db, result, startedAt)
  return result
}

/** Best-effort run log — a logging failure must never fail the job. */
export async function logRun(db: Db, result: RunResult, startedAt: string) {
  const { error } = await db.from("ingest_runs").insert({
    job: result.job,
    status: result.status,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    quotes_updated: result.quotesUpdated,
    articles_seen: result.articlesSeen,
    stories_upserted: result.storiesUpserted,
    sources_upserted: result.sourcesUpserted,
    detail: { errors: result.errors.slice(0, 25), warnings: result.warnings.slice(0, 25) },
  })
  if (error) console.log("[v0] ingest_runs insert failed:", error.message)
}
