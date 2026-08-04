import { isAuthorizedCron, unauthorized } from "@/lib/pipeline/auth"
import { runIngest } from "@/lib/pipeline/ingest"

// Never prerendered or cached — this route mutates data on a schedule.
export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Every 15 minutes: equity quotes + news ingestion + AI event clustering. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized()

  try {
    const result = await runIngest()
    console.log(
      `[v0] ingest ${result.status}: ${result.quotesUpdated} quotes, ${result.articlesSeen} articles, ${result.storiesUpserted} stories, ${result.sourcesUpserted} sources`,
    )
    // 200 even when partial — a non-2xx would make Vercel retry work that
    // already partially succeeded. The status field carries the detail.
    return Response.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.log("[v0] ingest failed:", message)
    return Response.json({ job: "ingest", status: "error", errors: [message] }, { status: 500 })
  }
}
