import { FinnhubQuoteProvider } from "./finnhub-quotes"
import { RssNewsProvider } from "./rss-news"
import { Sp500TickerUniverse } from "./sp500-universe"
import type { INewsProvider, IQuoteProvider, ITickerUniverse } from "./types"
import { YahooMacroQuoteProvider } from "./yahoo-macro-quotes"

export class ProviderRegistry {
  private quoteProviders: IQuoteProvider[] = []
  private newsProviders: INewsProvider[] = []
  private tickerUniverses: ITickerUniverse[] = []

  registerQuoteProvider(provider: IQuoteProvider): this {
    this.quoteProviders.push(provider)
    return this
  }

  registerNewsProvider(provider: INewsProvider): this {
    this.newsProviders.push(provider)
    return this
  }

  registerTickerUniverse(universe: ITickerUniverse): this {
    this.tickerUniverses.push(universe)
    return this
  }

  getQuoteProviders(): readonly IQuoteProvider[] {
    return this.quoteProviders
  }

  getNewsProviders(): readonly INewsProvider[] {
    return this.newsProviders
  }

  getTickerUniverses(): readonly ITickerUniverse[] {
    return this.tickerUniverses
  }

  getAllSymbols(): string[] {
    return Array.from(new Set(this.tickerUniverses.flatMap((u) => u.getSymbols())))
  }

  getAllAliases(): Record<string, readonly string[]> {
    const combined: Record<string, readonly string[]> = {}
    for (const universe of this.tickerUniverses) {
      Object.assign(combined, universe.getAliases())
    }
    return combined
  }

  getCandidates(headline: string, summary: string): string[] {
    const candidateSet = new Set<string>()
    for (const universe of this.tickerUniverses) {
      for (const ticker of universe.getCandidates(headline, summary)) {
        candidateSet.add(ticker)
      }
    }
    return Array.from(candidateSet)
  }
}

/** Default singleton instance containing built-in S&P 500, Finnhub, Yahoo, and RSS providers */
export const defaultRegistry = new ProviderRegistry()

// Register default providers
defaultRegistry
  .registerTickerUniverse(new Sp500TickerUniverse())
  .registerQuoteProvider(new FinnhubQuoteProvider())
  .registerQuoteProvider(new YahooMacroQuoteProvider())
  .registerNewsProvider(new RssNewsProvider())
