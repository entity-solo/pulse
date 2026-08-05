import { defaultRegistry } from "./providers/registry"
import type { IQuoteProvider } from "./providers/types"

export type QuoteUpdate = {
  symbol: string
  price: number
  change_pct: number
  direction: "up" | "dn"
}

/** Live US equity quotes from Finnhub (delegated to FinnhubQuoteProvider). */
export async function fetchEquityQuotes(): Promise<{ quotes: QuoteUpdate[]; errors: string[] }> {
  const provider = defaultRegistry.getQuoteProviders().find((p) => p.name === "finnhub")
  if (!provider) throw new Error("Finnhub quote provider not registered")
  return provider.fetchQuotes()
}

/** Live index / FX / rate / commodity / crypto levels (delegated to YahooMacroQuoteProvider). */
export async function fetchMacroQuotes(): Promise<{ quotes: QuoteUpdate[]; errors: string[] }> {
  const provider = defaultRegistry.getQuoteProviders().find((p) => p.name === "yahoo_finance")
  if (!provider) throw new Error("Yahoo Finance quote provider not registered")
  return provider.fetchQuotes()
}

/** Generic runner to execute all registered quote providers in parallel/sequence. */
export async function fetchAllQuotes(providers: readonly IQuoteProvider[] = defaultRegistry.getQuoteProviders()): Promise<{ quotes: QuoteUpdate[]; errors: string[] }> {
  const quotes: QuoteUpdate[] = []
  const errors: string[] = []

  for (const provider of providers) {
    try {
      const result = await provider.fetchQuotes()
      quotes.push(...result.quotes)
      errors.push(...result.errors)
    } catch (err) {
      errors.push(`${provider.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { quotes, errors }
}
