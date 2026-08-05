import { MACRO_SYMBOL_MAP } from "../config"
import type { QuoteUpdate } from "../quotes"
import type { IQuoteProvider } from "./types"

const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart"

function toUpdate(symbol: string, price: number, prevClose: number): QuoteUpdate | null {
  if (!Number.isFinite(price) || price <= 0) return null
  const changePct = Number.isFinite(prevClose) && prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0
  return {
    symbol,
    price: Number(price.toFixed(4)),
    change_pct: Number(changePct.toFixed(3)),
    direction: changePct < 0 ? "dn" : "up",
  }
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

export class YahooMacroQuoteProvider implements IQuoteProvider {
  readonly name = "yahoo_finance"
  readonly market = "macro"

  async fetchQuotes(): Promise<{ quotes: QuoteUpdate[]; errors: string[] }> {
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
}
