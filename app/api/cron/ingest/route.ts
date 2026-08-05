import { isAuthorizedCron, unauthorized } from "@/lib/pipeline/auth"
import { runIngestNews } from "@/lib/pipeline/ingest"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Job 2: Every 15 minutes — news ingest & pre-filter storage. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized()

  try {
    const result = await runIngestNews()
    console.log(`[news:ingest] ${result.status}: ${result.articlesSeen} articles seen`)
    return Response.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.log("[news:ingest] failed:", message)
    return Response.json({ job: "news:ingest", status: "error", errors: [message] }, { status: 500 })
  }
}
