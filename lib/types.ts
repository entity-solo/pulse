export type Sentiment = "bull" | "bear" | "neut"
export type Sector = "tech" | "finance" | "energy" | "macro" | "index" | "crypto" | "commodity"

export type Ticker = {
  symbol: string
  name: string
  exchange: string
  price: number
  change_pct: number
  direction: "up" | "dn"
  sector: Sector
  updated_at: string
}

export type StorySource = {
  id: string
  outlet: string
  headline: string
  excerpt: string
  angle: Sentiment
  url: string
  display_order: number
}

export type Story = {
  id: string
  ticker: string
  is_macro: boolean
  sentiment: Sentiment
  title: string
  summary: string
  published_at: string
  story_sources: StorySource[]
  tickers: Pick<Ticker, "symbol" | "name" | "sector" | "change_pct" | "direction" | "price"> | null
}

/** Derived in app — never stored. */
export function sentimentLabel(s: Sentiment) {
  return s === "bull" ? "Bullish" : s === "bear" ? "Bearish" : "Neutral"
}

export function formatPrice(value: number) {
  const abs = Math.abs(value)
  return value.toLocaleString("en-US", {
    minimumFractionDigits: abs < 10 ? 4 : 2,
    maximumFractionDigits: abs < 10 ? 4 : 2,
  })
}

export function formatChange(pct: number) {
  return `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`
}

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.max(1, Math.round(diff / 60000))
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}
