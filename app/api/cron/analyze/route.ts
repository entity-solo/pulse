import { isAuthorizedCron, unauthorized } from "@/lib/pipeline/auth"
import { runAnalyzePipeline } from "@/lib/pipeline/ingest"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Job 3: Every 15 minutes (offset 1 minute) — Groq classification, clustering, impact analysis. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized()

  try {
    const result = await runAnalyzePipeline()
    console.log(`[pipeline:analyze] ${result.status}: ${result.storiesUpserted} stories, ${result.sourcesUpserted} sources, ${result.tokensUsed} tokens`)
    return Response.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.log("[pipeline:analyze] failed:", message)
    return Response.json({ job: "pipeline:analyze", status: "error", errors: [message] }, { status: 500 })
  }
}
