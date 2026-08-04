import { createAdminClient } from "@/lib/supabase/admin"
import { isAuthorizedCron, unauthorized } from "@/lib/pipeline/auth"
import { logRun, runQuotes } from "@/lib/pipeline/ingest"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * Hourly: refreshes indices, FX, rates, commodities and crypto from Yahoo
 * Finance. Separate from the 15-minute job because these move more slowly and
 * come from a different (unofficial, unkeyed) provider.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return unauthorized()

  const startedAt = new Date().toISOString()

  try {
    const result = await runQuotes({ equities: false, macro: true })
    await logRun(createAdminClient(), result, startedAt)
    console.log(`[v0] macro ${result.status}: ${result.quotesUpdated} quotes updated`)
    return Response.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.log("[v0] macro failed:", message)
    return Response.json({ job: "quotes:macro", status: "error", errors: [message] }, { status: 500 })
  }
}
