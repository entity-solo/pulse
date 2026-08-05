import { EQUITY_SYMBOLS, MACRO_SYMBOL_MAP } from "./config"

export type QuoteUpdate = {
  symbol: string
  price: number
  change_pct: number
  direction: "up" | "dn"
}

const FINNHUB_BASE = "https://finnhub.io/api/v1"
const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart"

function toUpdate(symbol: string, price: number, prevClose: number): QuoteUpdate | null {
  if (!Number.isFinite(price) || price <= 0) return null

  // A missing/zero previous close would produce Infinity — fall back to flat.
  const changePct = Number.isFinite(prevClose) && prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0

  return {
    symbol,
    price: Number(price.toFixed(4)),
    change_pct: Number(changePct.toFixed(3)),
    // The `direction` check constraint only allows 'up' | 'dn', so exactly-flat
    // is reported as 'up' to stay valid.
    direction: changePct < 0 ? "dn" : "up",
  }
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    // These endpoints are polled on a schedule; never serve a cached response.
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

async function fetchQuoteWithRetry(symbol: string, token: string, maxRetries = 2): Promise<QuoteUpdate> {
  const finnhubSymbol = symbol === "BRK.B" ? "BRK-B" : symbol === "FI" ? "FISV" : symbol
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const data = await fetchJson(`${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(finnhubSymbol)}&token=${token}`)
      const update = toUpdate(symbol, Number(data?.c), Number(data?.pc))
      if (update) {
        if (Number.isFinite(Number(data?.dp))) {
          const dp = Number(data.dp)
          update.change_pct = Number(dp.toFixed(3))
          update.direction = dp < 0 ? "dn" : "up"
        }
        return update
      }
    } catch (err: any) {
      if (err?.message?.includes("429") && attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)))
        continue
      }
      throw err
    }
  }
  throw new Error(`no price for ${symbol}`)
}

/** Live US equity quotes from Finnhub (batched in 5 with retry on 429). */
export async function fetchEquityQuotes(): Promise<{ quotes: QuoteUpdate[]; errors: string[] }> {
  const token = process.env.FINNHUB_API_KEY
  if (!token) throw new Error("Missing FINNHUB_API_KEY")

  const quotes: QuoteUpdate[] = []
  const errors: string[] = []
  const batchSize = 5

  for (let i = 0; i < EQUITY_SYMBOLS.length; i += batchSize) {
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    const batch = EQUITY_SYMBOLS.slice(i, i + batchSize)
    const results = await Promise.allSettled(
      batch.map((symbol) => fetchQuoteWithRetry(symbol, token)),
    )

    results.forEach((r, idx) => {
      if (r.status === "fulfilled") quotes.push(r.value)
      else errors.push(`${batch[idx]}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`)
    })
  }

  return { quotes, errors }
}

/**
 * Live index / FX / rate / commodity / crypto levels from Yahoo Finance.
 * Returns the true quoted level for each symbol rather than an ETF proxy.
 */
export async function fetchMacroQuotes(): Promise<{ quotes: QuoteUpdate[]; errors: string[] }> {
  const entries = Object.entries(MACRO_SYMBOL_MAP)
  const quotes: QuoteUpdate[] = []
  const errors: string[] = []

  for (const [symbol, yahooSymbol] of entries) {
    try {
      const data = await fetchJson(
        `${YAHOO_BASE}/${encodeURIComponent(yahooSymbol)}?interval=1d&range=5d`,
        { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", Accept: "application/json" } },
      )
      const meta = data?.chart?.result?.[0]?.meta
      if (!meta) throw new Error(`no chart data for ${yahooSymbol}`)

      const price = Number(meta.regularMarketPrice)
      const prevClose = Number(meta.previousClose ?? meta.chartPreviousClose)

      const update = toUpdate(symbol, price, prevClose)
      if (!update) throw new Error(`no price for ${yahooSymbol}`)
      quotes.push(update)
    } catch (err) {
      errors.push(`${symbol}: ${err instanceof Error ? err.message : String(err)}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }

  return { quotes, errors }
}
