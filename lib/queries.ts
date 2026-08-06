import { createClient } from "@/lib/supabase/server"
import type { Sector, Story, Ticker } from "@/lib/types"

const STORY_SELECT = `
  id, ticker, is_macro, sentiment, title, summary, published_at,
  story_sources ( id, outlet, headline, excerpt, angle, url, display_order ),
  tickers!inner ( symbol, name, sector, price, change_pct, direction )
`

function normalize(rows: unknown): Story[] {
  return ((rows ?? []) as Story[]).map((story) => ({
    ...story,
    story_sources: [...(story.story_sources ?? [])].sort((a, b) => a.display_order - b.display_order),
  }))
}

export const TICKER_BAR_SYMBOLS = ["SPX", "NDX", "DJI", "VIX", "BTC", "XAU", "DXY"]
export const SNAPSHOT_SYMBOLS = ["SPX", "NDX", "DJI", "US10Y", "EURUSD", "WTI", "XAU"]

/** Filter tabs map to a sector on the joined `tickers` row. */
export async function getStories(sector?: Sector) {
  const supabase = await createClient()
  let query = supabase.from("stories").select(STORY_SELECT).order("published_at", { ascending: false }).limit(40)

  if (sector === "macro") {
    query = query.in("tickers.sector", ["macro", "index", "commodity"])
  } else if (sector) {
    query = query.eq("tickers.sector", sector)
  }

  const { data, error } = await query
  if (error) throw error
  return normalize(data)
}

export async function getStoriesForTickers(symbols: string[]) {
  if (symbols.length === 0) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("stories")
    .select(STORY_SELECT)
    .in("ticker", symbols)
    .order("published_at", { ascending: false })
  if (error) throw error
  return normalize(data)
}

export async function getTicker(symbol: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.from("tickers").select("*").eq("symbol", symbol.toUpperCase()).maybeSingle()
  if (error) throw error
  return data as Ticker | null
}

export async function getTickersBySymbols(symbols: string[]) {
  if (symbols.length === 0) return []
  const supabase = await createClient()
  const { data, error } = await supabase.from("tickers").select("*").in("symbol", symbols)
  if (error) throw error
  const order = new Map(symbols.map((s, i) => [s, i]))
  return (data as Ticker[]).sort((a, b) => (order.get(a.symbol) ?? 0) - (order.get(b.symbol) ?? 0))
}

/** Top movers: ordered by absolute change, computed in SQL via a generated sort. */
export async function getTopMovers(limit = 5) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("tickers")
    .select("*")
    .not("sector", "in", "(index,macro)")
    .order("change_pct", { ascending: false })
  if (error) throw error
  return (data as Ticker[]).sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct)).slice(0, limit)
}

export async function getWatchlistSymbols() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null, symbols: [] as string[] }

  const { data, error } = await supabase
    .from("watchlist")
    .select("ticker, added_at")
    .order("added_at", { ascending: false })
  if (error) throw error
  return { user, symbols: (data ?? []).map((row) => row.ticker as string) }
}
