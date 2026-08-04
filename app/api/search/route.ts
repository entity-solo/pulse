import { createClient } from "@/lib/supabase/server"
import type { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  const term = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 40)
  if (!term) return Response.json({ tickers: [] })

  const escaped = term.replace(/[%_,()]/g, " ")
  const supabase = await createClient()

  // Company/ticker search only — index and macro symbols are excluded.
  const { data, error } = await supabase
    .from("tickers")
    .select("symbol, name, exchange, price, change_pct, direction, sector, updated_at")
    .not("sector", "in", "(index,macro)")
    .or(`symbol.ilike.${escaped}%,name.ilike.%${escaped}%`)
    .order("symbol")
    .limit(8)

  if (error) {
    console.log("[v0] ticker search failed:", error.message)
    return Response.json({ tickers: [] }, { status: 200 })
  }

  return Response.json({ tickers: data ?? [] })
}
