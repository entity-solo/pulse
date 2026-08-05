import { isAuthorizedCron, unauthorized } from "@/lib/pipeline/auth"
import { runQuotes } from "@/lib/pipeline/ingest"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Job 1: Every 5 minutes — quotes sync (Finnhub parallel + Yahoo 300ms sequential). */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized()

  try {
    const result = await runQuotes({ equities: true, macro: true })
    console.log(`[quotes:sync] ${result.status}: ${result.quotesUpdated} quotes updated`)
    return Response.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.log("[quotes:sync] failed:", message)
    return Response.json({ job: "quotes:sync", status: "error", errors: [message] }, { status: 500 })
  }
}
