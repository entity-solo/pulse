import { EQUITY_SYMBOLS } from "../config"
import type { QuoteUpdate } from "../quotes"
import type { IQuoteProvider } from "./types"

const FINNHUB_BASE = "https://finnhub.io/api/v1"

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

export class FinnhubQuoteProvider implements IQuoteProvider {
  readonly name = "finnhub"
  readonly market = "us_equities"

  async fetchQuotes(): Promise<{ quotes: QuoteUpdate[]; errors: string[] }> {
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
}
