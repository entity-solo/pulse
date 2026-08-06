import { createAdminClient } from "./lib/supabase/admin.ts"
import { isAuthorizedCron, unauthorized } from "./lib/pipeline/auth.ts"
import { EQUITY_SYMBOLS } from "./lib/pipeline/config.ts"
import type { Db } from "./lib/pipeline/db.ts"
import { runGc } from "./lib/pipeline/db.ts"
import { runAnalyzePipeline, runIngestNews, runQuotes, type RunResult } from "./lib/pipeline/ingest.ts"
import { clearQuoteWindow, setQuoteWindow } from "./lib/pipeline/providers/finnhub-quotes.ts"

const QUOTES_PER_RUN = 60
const QUOTES_OFFSET_KEY = "quotes_offset"

/**
 * Cron entrypoint for the pipeline. Replaces the Vercel cron routes
 * (app/api/cron/*) and the legacy sync edge function. pg_cron posts to
 * /functions/v1/pipeline?job=<ingest|analyze|quotes|gc> with
 * `Authorization: Bearer $CRON_SECRET`.
 */
Deno.serve(async (req: Request) => {
  if (!isAuthorizedCron(req)) return unauthorized()

  const url = new URL(req.url)
  const job = url.searchParams.get("job")

  try {
    switch (job) {
      case "ingest":
        return Response.json(await runIngestNews())
      case "analyze":
        return Response.json(await runAnalyzePipeline())
      case "quotes":
        return Response.json(await runQuotesJob())
      case "gc":
        return Response.json(await runGcJob())
      default:
        return Response.json({ error: `unknown job: ${job ?? "(missing)"}` }, { status: 400 })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.log(`[pipeline:${job ?? "unknown"}] failed:`, message)
    return Response.json({ job: `pipeline:${job ?? "unknown"}`, status: "error", errors: [message] }, { status: 500 })
  }
})

async function readQuotesOffset(db: Db): Promise<number> {
  const { data } = await db
    .from("pipeline_state")
    .select("value")
    .eq("key", QUOTES_OFFSET_KEY)
    .maybeSingle()
  return data?.value ?? 0
}

async function writeQuotesOffset(db: Db, value: number): Promise<void> {
  const { error } = await db
    .from("pipeline_state")
    .upsert({ key: QUOTES_OFFSET_KEY, value, updated_at: new Date().toISOString() }, { onConflict: "key" })
  if (error) console.log("[pipeline:quotes] offset update failed:", error.message)
}

/** Fetch a rolling 60-symbol window of the equity universe, then advance the offset. */
async function runQuotesJob(): Promise<RunResult> {
  const db = createAdminClient()
  const offset = await readQuotesOffset(db)
  setQuoteWindow(offset, QUOTES_PER_RUN)
  try {
    const result = await runQuotes({ equities: true, macro: true })
    if (result.status !== "skipped") {
      const next = offset + QUOTES_PER_RUN >= EQUITY_SYMBOLS.length ? 0 : offset + QUOTES_PER_RUN
      await writeQuotesOffset(db, next)
      console.log(
        `[pipeline:quotes] window ${offset}..${Math.min(offset + QUOTES_PER_RUN, EQUITY_SYMBOLS.length)}, next offset ${next}`,
      )
    }
    return result
  } finally {
    clearQuoteWindow()
  }
}

async function runGcJob(): Promise<RunResult> {
  const db = createAdminClient()
  const result: RunResult = {
    job: "pipeline:gc",
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
    await runGc(db, result.warnings)
    console.log(`[pipeline:gc] done with ${result.warnings.length} warnings`)
  } catch (error) {
    result.errors.push(`pipeline:gc failed: ${error instanceof Error ? error.message : String(error)}`)
    result.status = "error"
  }
  if (result.warnings.length) console.log("[pipeline:gc] warnings:", result.warnings)
  return result
}
